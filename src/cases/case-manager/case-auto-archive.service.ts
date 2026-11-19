import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Case, CaseWorkflowStatus } from '../schemas/case.schema';

const DAY_MS = 86_400_000;

/**
 * Completed cases move to ARCHIVED automatically once they have been completed
 * for ARCHIVE_AFTER_DAYS (default 30). Until then the Archived Cases pages
 * show them as "Recently Completed". Runs at start-up and then every hour;
 * set ARCHIVE_AFTER_DAYS=0 to disable.
 */
@Injectable()
export class CaseAutoArchiveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CaseAutoArchiveService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(@InjectModel(Case.name) private readonly caseModel: Model<any>) {}

  get afterDays(): number {
    const n = Number(process.env.ARCHIVE_AFTER_DAYS ?? 30);
    return Number.isFinite(n) && n >= 0 ? n : 30;
  }

  onModuleInit() {
    if (this.afterDays === 0) return;
    // Let the app finish booting before the first sweep.
    setTimeout(() => void this.archiveDue(), 10_000).unref();
    this.timer = setInterval(() => void this.archiveDue(), 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Archive every case completed at least `afterDays` ago. Returns the count. */
  async archiveDue(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.afterDays * DAY_MS);
    try {
      const due = await this.caseModel.find({
        workflowStatus: CaseWorkflowStatus.COMPLETED,
        $or: [
          { completedAt: { $lte: cutoff } },
          // Older completed cases without a completion date.
          { completedAt: null, updatedAt: { $lte: cutoff } },
        ],
      });
      for (const c of due) {
        c.workflowStatus = CaseWorkflowStatus.ARCHIVED;
        c.archivedAt = now;
        c.readyForArchive = false;
        await c.save();
      }
      if (due.length) this.logger.log(`Auto-archived ${due.length} completed case(s)`);
      return due.length;
    } catch (err: any) {
      this.logger.error(`Auto-archive failed: ${err?.message || err}`);
      return 0;
    }
  }
}
