// Logs refused requests (401 / 403, and the older "Admin only" 400s) as
// Unauthorized Access Attempts, then hands the error to Nest's default
// handling so responses are unchanged.
//
// It also logs every 5xx. Nest's BaseExceptionFilter only logs exceptions that
// are NOT HttpException, so a deliberate InternalServerErrorException (the kind
// S3Service throws) used to return a bare 500 to the browser with nothing at
// all in the server log. Every 500 now leaves a line naming the route, the
// caller and the cause.

import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { caseIdFromPath, stripPrefix } from './activity-routes';
import { SecurityEventKind } from './schemas/tracking.schemas';
import { SecurityEventService } from './security-event.service';

const DENIAL_MESSAGE = /admin only|only (a |an )?(case manager|admin|lawyer)|not allowed|forbidden|not authori[sz]ed|access denied|do not have access|cannot access/i;

const serverErrorLogger = new Logger('ServerError');

@Catch()
export class SecurityExceptionFilter extends BaseExceptionFilter {
  constructor(
    adapter: any,
    private readonly events: SecurityEventService,
  ) {
    super(adapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    try {
      if (host.getType() === 'http') {
        if (exception instanceof HttpException) this.maybeLog(exception, host);
        this.logServerError(exception, host);
      }
    } catch {
      // Logging must never change the response.
    }
    super.catch(exception, host);
  }

  /**
   * One line per 5xx, with the stack. Without this a 500 raised as an
   * HttpException is invisible: Nest replies and logs nothing.
   */
  private logServerError(exception: unknown, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    if (status < 500) return;

    const req = host.switchToHttp().getRequest();
    const path: string = (req.originalUrl || req.url || '').split('?')[0];
    const user = req.user;
    const who = user
      ? `${user.role ?? 'user'} ${user.id ?? user._id ?? '?'}`
      : 'anonymous';

    const err = exception as any;
    const detail =
      exception instanceof HttpException
        ? (exception.getResponse() as any)?.message ?? exception.message
        : err?.message ?? String(exception);
    const code = err?.code ? ` (code ${err.code})` : '';

    serverErrorLogger.error(
      `${req.method} ${path} -> ${status} [${who}] ${detail}${code}`,
    );
    if (err?.stack) serverErrorLogger.error(err.stack);
  }

  private maybeLog(exception: HttpException, host: ArgumentsHost) {
    const status = exception.getStatus();
    const message = String((exception.getResponse() as any)?.message ?? exception.message ?? '');
    const denied =
      status === 401 || status === 403 || (status === 400 && DENIAL_MESSAGE.test(message));
    if (!denied) return;

    const req = host.switchToHttp().getRequest();
    const path: string = (req.originalUrl || req.url || '').split('?')[0];
    const p = stripPrefix(path);
    // Signing in and session checks have their own logging (failed logins)
    // or are expected to 401 for signed-out visitors.
    if (/^\/auth\//.test(p) || /^\/payments\/stripe\/webhook/.test(p)) return;

    const user = req.user;
    const hadToken = !!(req.cookies?.access_token || req.headers?.authorization);
    const caseId = caseIdFromPath(path);
    const attemptType = caseId ? 'Unauthorized Case Access' : 'Restricted Page Access';
    const reason =
      status === 401
        ? hadToken
          ? 'Invalid or expired session'
          : 'Not signed in'
        : message || 'Access denied';

    void this.events.record(
      {
        kind: SecurityEventKind.UNAUTHORIZED,
        result: 'DENIED',
        attemptType,
        reason,
        userId: user?.id ?? user?._id ?? null,
        userName: user?.name ?? null,
        email: user?.email ?? null,
        role: user?.role ?? null,
        caseId,
        target: path,
        method: req.method,
        statusCode: status,
        details: `${req.method} ${path} → ${status}${message ? ` (${message})` : ''}`,
      },
      // One row per caller and target per minute, so a retrying page does
      // not flood the log.
      `denied|${user?.id ?? req.ip}|${req.method}|${path}|${status}`,
      60 * 1000,
    );
  }
}
