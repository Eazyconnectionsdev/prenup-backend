import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Case } from '../schemas/case.schema';
import { Lawyer } from '../schemas/lawyer.schema';
import { User } from '../../users/schemas/user.schema';
import { isAssignedLawyer, isStaffRole } from '../case-access.util';

/**
 * For the lawyer portal's case routes (`/lawyer/:caseId/...`): staff, or the
 * lawyer assigned to that case. Clients and other lawyers are refused, so a
 * signed-in user cannot read or advance a case they have no part in. Routes
 * without a `:caseId` (dashboard, lists, lawyer management) pass through; they
 * have their own role checks or only return the caller's own data.
 */
@Injectable()
export class LawyerCaseGuard implements CanActivate {
  constructor(
    @InjectModel(Case.name) private caseModel: Model<any>,
    @InjectModel(User.name) private userModel: Model<any>,
    @InjectModel(Lawyer.name) private lawyerModel: Model<any>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const caseId = req.params?.caseId;
    if (!caseId) return true;

    const actor = req.user;
    if (!actor) throw new ForbiddenException('Forbidden');
    if (isStaffRole(actor.role)) return true;

    // Let the handler answer a malformed or unknown id the way it always has.
    if (!isValidObjectId(caseId)) return true;
    const c = (await this.caseModel
      .findById(caseId)
      .select('assignedLawyerP1 assignedLawyerP2')
      .lean()
      .exec()) as { assignedLawyerP1?: any; assignedLawyerP2?: any } | null;
    if (!c) return true;

    if (await isAssignedLawyer({ user: this.userModel, lawyer: this.lawyerModel }, c, actor)) {
      return true;
    }
    throw new ForbiddenException('Forbidden');
  }
}
