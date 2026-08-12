
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument } from './schemas/company.schema';
import { Lawyer, LawyerDocument } from './schemas/lawyer.schema';
import { Enquiry, EnquiryDocument } from './schemas/enquiry.schema';
import { CreateLawyerDto } from './dto/create-lawyer.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Lawyer.name) private lawyerModel: Model<LawyerDocument>,
    @InjectModel(Enquiry.name) private enquiryModel: Model<EnquiryDocument>,
  ) {}

  // ---------------- Users -----------------
  async listUsers(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.userModel.find().skip(skip).limit(limit).lean().exec();
    const total = await this.userModel.countDocuments().exec();
    return { total, docs };
  }

  async getUserById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid user id');
    const u = await this.userModel.findById(id).exec();
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  async updateUserRole(id: string, role: string, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid user id');
    const allowed = ['user', 'admin', 'superadmin', 'case_manager'];
    if (!allowed.includes(role)) throw new BadRequestException('Invalid role');
    const updated = await this.userModel.findByIdAndUpdate(id, { role }, { new: true }).exec();
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  async deactivateUser(id: string, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid user id');
    const updated = await this.userModel.findByIdAndUpdate(id, { active: false }, { new: true }).exec();
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  // ---------------- Enquiries -----------------
  async listEnquiries(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.enquiryModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec();
    const total = await this.enquiryModel.countDocuments().exec();
    return { total, docs };
  }

  async createEnquiry(payload: any) {
    const doc = new this.enquiryModel(payload);
    return doc.save();
  }

  // ---------------- Companies -----------------
  async listCompanies(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.companyModel.find().skip(skip).limit(limit).lean().exec();
    const total = await this.companyModel.countDocuments().exec();
    return { total, docs };
  }

  async createCompany(payload: Partial<Company>) {
    const doc = new this.companyModel(payload);
    return doc.save();
  }

  async setCompanyVerified(id: string, verified: boolean, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid company id');
    const updated = await this.companyModel.findByIdAndUpdate(id, { verified }, { new: true }).exec();
    if (!updated) throw new NotFoundException('Company not found');
    return updated;
  }

  // ---------------- Lawyers -----------------
  async listLawyers(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const docs = await this.lawyerModel.find().populate('company').skip(skip).limit(limit).lean().exec();
    const total = await this.lawyerModel.countDocuments().exec();
    return { total, docs };
  }

  /**
   * Create a lawyer from a CreateLawyerDto. This converts the incoming `company` string
   * into a Types.ObjectId and validates that the company exists. This keeps TypeScript
   * types clean and prevents runtime surprises.
   */
  async createLawyer(payload: CreateLawyerDto) {
    // validate company id string
    if (!payload.company || !Types.ObjectId.isValid(String(payload.company))) {
      throw new BadRequestException('Valid company id required');
    }

    const companyId = new Types.ObjectId(payload.company);

    // ensure company exists
    const companyExists = await this.companyModel.exists({ _id: companyId });
    if (!companyExists) {
      throw new BadRequestException('Company not found');
    }

    // build the document payload converting company to ObjectId
    const docPayload: Partial<Lawyer> = {
      externalId: payload.externalId,
      name: payload.name,
      priceText: payload.priceText,
      avatarUrl: payload.avatarUrl,
      company: companyId,
      publicEmail: payload.publicEmail,
      publicPhone: payload.publicPhone,
      directEmail: payload.directEmail,
      directPhone: payload.directPhone,
      website: payload.website,
      profileLink: payload.profileLink,
      address: payload.address,
      barNumber: payload.barNumber,
      notes: payload.notes,
      // do not set verified here unless you want admins to mark it explicitly
    };

    const doc = new this.lawyerModel(docPayload);
    return doc.save();
  }

  async setLawyerVerified(id: string, verified: boolean, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    const updated = await this.lawyerModel.findByIdAndUpdate(id, { verified }, { new: true }).exec();
    if (!updated) throw new NotFoundException('Lawyer not found');
    return updated;
  }

  async archiveLawyer(id: string, actorId: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid lawyer id');
    const updated = await this.lawyerModel.findByIdAndUpdate(id, { status: 'archived' }, { new: true }).exec();
    if (!updated) throw new NotFoundException('Lawyer not found');
    return updated;
  }
}