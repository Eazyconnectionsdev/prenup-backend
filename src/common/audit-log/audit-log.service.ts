import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';


@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async log(dto: CreateAuditLogDto): Promise<AuditLogDocument | null> {
    try {
      const entry = new this.auditLogModel({
        module: dto.module,
        entityType: dto.entityType,
        entityId: new Types.ObjectId(dto.entityId),
        caseId: new Types.ObjectId(dto.caseId),
        action: dto.action,
        userId: new Types.ObjectId(dto.userId),
        userRole: dto.userRole,
        stage: dto.stage,
        changedFields: dto.changedFields,
        notes: dto.notes,

        ipAddress: dto.ipAddress,
        userAgent: dto.userAgent,
      });

      return await entry.save();
    } catch (err) {
      this.logger.error(
        `Audit log failed [module=${dto.module}, entity=${dto.entityType}:${dto.entityId}, action=${dto.action}]`,
        err instanceof Error ? err.stack : String(err),

      );
      return null;
    }

  }


  async getCaseTimeline(

    caseId: string | Types.ObjectId,

    options?: { limit?: number; skip?: number },

  ): Promise<AuditLogDocument[]> {
    return this.auditLogModel


      .find({ caseId: new Types.ObjectId(caseId) })

      .sort({ createdAt: -1 })
      .skip(options?.skip ?? 0)
      .limit(options?.limit ?? 100)
      .populate('userId', 'name email')
  }



  async getEntityHistory(
    entityType: string,
    entityId: string | Types.ObjectId,
  ): Promise<AuditLogDocument[]> {
    return this.auditLogModel
      .find({ entityType, entityId: new Types.ObjectId(entityId) })

      .sort({ createdAt: -1 })
      .populate('userId', 'name email')

  }

  async getUserActivity(

    userId: string | Types.ObjectId,

    options?: { module?: string; limit?: number },
  ): Promise<AuditLogDocument[]> {
    return this.auditLogModel
      .find({

        userId: new Types.ObjectId(userId),

        ...(options?.module ? { module: options.module } : {}),
      })

      .sort({ createdAt: -1 })
      .limit(options?.limit ?? 100)

  }


  async getModuleLogs(
    module: string,
    options?: { limit?: number; skip?: number },

  ): Promise<AuditLogDocument[]> {
    return this.auditLogModel
      .find({ module })
      .sort({ createdAt: -1 })
      .skip(options?.skip ?? 0)
      .limit(options?.limit ?? 100)
  }
}