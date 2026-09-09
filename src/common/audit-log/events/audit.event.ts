import { CreateAuditLogDto } from "../dto/create-audit-log.dto";

export const AUDIT_EVENT = 'audit.log';

export class AuditEvent extends CreateAuditLogDto {}