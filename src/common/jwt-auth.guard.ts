// jwt-auth.guard.ts
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequestContext } from './request-context';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err, user, info, context: ExecutionContext) {
    if (err) {
      throw err;
    }
    if (!user) {
      throw new UnauthorizedException();
    }
    // Audit records made during this request name this user as the actor.
    RequestContext.setUser({
      id: String(user.id ?? user._id),
      role: user.role,
      email: user.email,
      name: user.name,
    });
    return user;
  }
}
