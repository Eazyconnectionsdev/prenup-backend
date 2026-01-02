
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company, CompanyDocument } from './schemas/company.schema';

@Injectable()
export class CompaniesService {
  constructor(@InjectModel(Company.name) private companyModel: Model<CompanyDocument>) {}

  async create(dto: Partial<Company>) {
    const created = new this.companyModel(dto);
    return created.save();
  }

  async listAll() {
    return this.companyModel.find().lean().exec();
  }

  async findById(id: string) {
    if (!id) throw new BadRequestException('Invalid id');
    return this.companyModel.findById(id).exec();
  }

  async seedInitialCompaniesIfEmpty() {
    const count = await this.companyModel.countDocuments().exec();
    if (count > 0) return { seeded: false };

    const companies = [
      { name: 'SALESQL LTD', companyNumber: '12345678', photoUrl: 'https://i.pravatar.cc/200?img=47' },
      { name: 'Tech Solutions', companyNumber: '87654321', photoUrl: 'https://i.pravatar.cc/200?img=48' },
    ];

    await this.companyModel.insertMany(companies);
    return { seeded: true, count: companies.length };
  }
}