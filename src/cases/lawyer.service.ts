// src/cases/lawyers.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lawyer, LawyerDocument } from './schemas/lawyer.schema';
import { Company, CompanyDocument } from './schemas/company.schema';

@Injectable()
export class LawyersService {
  constructor(
    @InjectModel(Lawyer.name)
    private readonly lawyerModel: Model<LawyerDocument>,

    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
  ) {}

  /* ---------------- SEED ---------------- */

  async seedInitialLawyersIfEmpty() {
    const count = await this.lawyerModel.countDocuments().exec();
    if (count > 0) return { seeded: false };

    const lawyers = [
      { externalId: '1', name: 'Flavia Lamia', priceText: '£300 including VAT/VAT exempt', avatarUrl: 'https://i.pravatar.cc/200?img=32' },
      { externalId: '2', name: 'Lisa Smith', priceText: '£300 including VAT/VAT exempt', avatarUrl: 'https://i.pravatar.cc/200?img=12' },
      { externalId: '3', name: 'Karen Weiner', priceText: '£300 including VAT/VAT exempt', avatarUrl: 'https://i.pravatar.cc/200?img=56' },
      { externalId: '4', name: 'Kye Herbert', priceText: '£300 including VAT/VAT exempt', avatarUrl: 'https://i.pravatar.cc/200?img=14' },
      { externalId: '5', name: 'Carol Wright', priceText: '£300 including VAT/VAT exempt', avatarUrl: 'https://i.pravatar.cc/200?img=24' },
      { externalId: '6', name: 'Corinne Parke', priceText: '£300 + VAT', avatarUrl: 'https://i.pravatar.cc/200?img=6' },
      { externalId: '7', name: 'Richard Buxton', priceText: '£300 + VAT', avatarUrl: 'https://i.pravatar.cc/200?img=18' },
      { externalId: '9', name: 'Bethan Hill-Howells', priceText: '£300 + VAT', avatarUrl: 'https://i.pravatar.cc/200?img=10' },
      { externalId: '10', name: 'Helen Boynton', priceText: '£300 + VAT', avatarUrl: 'https://i.pravatar.cc/200?img=52' },
    ];

    await this.lawyerModel.insertMany(lawyers);
    return { seeded: true, count: lawyers.length };
  }

  /* ---------------- CREATE ---------------- */

  async create(companyId: string, payload: Partial<Lawyer>) {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException('Invalid companyId');
    }

    const company = await this.companyModel.findById(companyId).exec();
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Optional: prevent duplicate lawyer names under same company
    const exists = await this.lawyerModel.findOne({
      name: payload.name,
      company: company._id,
    });

    if (exists) {
      throw new BadRequestException('Lawyer already exists for this company');
    }

    const lawyer = new this.lawyerModel({
      ...payload,
      company: company._id,
      createdBy: 'admin', // optional audit field
    });

    return lawyer.save();
  }

  /* ---------------- READ ---------------- */

  async listAll() {
    return this.lawyerModel
      .find()
      .populate('company', 'name')
      .lean()
      .exec();
  }

  async findById(id: string) {
    return this.lawyerModel
      .findById(id)
      .populate('company', 'name')
      .exec();
  }
}
