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
  ) { }

  /* ---------------- SEED ---------------- */
  async seedInitialLawyersIfEmpty() {
    const count = await this.lawyerModel.countDocuments().exec();
    if (count > 0) return { seeded: false };

    // Resolve Company model (assumes Company schema has been registered with Mongoose)
    let CompanyModel: any = null;
    try {
      CompanyModel = this.lawyerModel.db.model('Company');
    } catch (err) {
      // model not registered yet — try to require via mongoose registry (this will throw if not registered)
      // In most apps the Company model will be registered; if not, we'll fallback to creating an ObjectId.
      CompanyModel = null;
    }

    let defaultCompanyId: any = null;
    if (CompanyModel) {
      // try to find a sensible default company
      let defaultCompany = await CompanyModel.findOne({ name: 'Default Company' }).exec();
      if (!defaultCompany) {
        // create a minimal default company so lawyer.company refs are valid
        try {
          defaultCompany = await CompanyModel.create({ name: 'Default Company' });
        } catch (err) {
          // creation failed — fall back to null and we'll use an ObjectId below
          defaultCompany = null;
        }
      }
      if (defaultCompany && defaultCompany._id) defaultCompanyId = defaultCompany._id;
    }

    // fallback: if we couldn't resolve/create a Company document, use a fresh ObjectId
    // (this will reference a non-existent company doc but keeps seeding working;
    // ideally you have a Company document in DB)
    if (!defaultCompanyId) {
      defaultCompanyId = new (require('mongoose').Types).ObjectId();
      // optional: log a warning in your service (if logger available)
      if ((this as any).logger && typeof (this as any).logger.warn === 'function') {
        (this as any).logger.warn('No Company model/record found — using fallback ObjectId for seeded lawyers.company');
      } else {
        console.warn('No Company model/record found — using fallback ObjectId for seeded lawyers.company');
      }
    }

    const lawyers = [
      {
        externalId: '1',
        name: 'Flavia Lamia',
        priceText: '£300 including VAT/VAT exempt',
        avatarUrl: 'https://i.pravatar.cc/200?img=32',
        // put email in first two as requested (direct preferred)
        directEmail: 'azizahmedse@gmail.com',
        company: defaultCompanyId,
      },
      {
        externalId: '2',
        name: 'Lisa Smith',
        priceText: '£300 including VAT/VAT exempt',
        avatarUrl: 'https://i.pravatar.cc/200?img=12',
        directEmail: 'azizahmedse@gmail.com',
        company: defaultCompanyId,
      },
      {
        externalId: '3',
        name: 'Karen Weiner',
        priceText: '£300 including VAT/VAT exempt',
        avatarUrl: 'https://i.pravatar.cc/200?img=56',
        company: defaultCompanyId,
      },
      {
        externalId: '4',
        name: 'Kye Herbert',
        priceText: '£300 including VAT/VAT exempt',
        avatarUrl: 'https://i.pravatar.cc/200?img=14',
        company: defaultCompanyId,
      },
      {
        externalId: '5',
        name: 'Carol Wright',
        priceText: '£300 including VAT/VAT exempt',
        avatarUrl: 'https://i.pravatar.cc/200?img=24',
        company: defaultCompanyId,
      },
      {
        externalId: '6',
        name: 'Corinne Parke',
        priceText: '£300 + VAT',
        avatarUrl: 'https://i.pravatar.cc/200?img=6',
        company: defaultCompanyId,
      },
      {
        externalId: '7',
        name: 'Richard Buxton',
        priceText: '£300 + VAT',
        avatarUrl: 'https://i.pravatar.cc/200?img=18',
        company: defaultCompanyId,
      },
      {
        externalId: '9',
        name: 'Bethan Hill-Howells',
        priceText: '£300 + VAT',
        avatarUrl: 'https://i.pravatar.cc/200?img=10',
        company: defaultCompanyId,
      },
      {
        externalId: '10',
        name: 'Helen Boynton',
        priceText: '£300 + VAT',
        avatarUrl: 'https://i.pravatar.cc/200?img=52',
        company: defaultCompanyId,
      },
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
