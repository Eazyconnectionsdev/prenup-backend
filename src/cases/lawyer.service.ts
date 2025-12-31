// src/cases/lawyers.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lawyer, LawyerDocument } from './schemas/lawyer.schema';

@Injectable()
export class LawyersService {
  constructor(@InjectModel(Lawyer.name) private lawyerModel: Model<LawyerDocument>) {}

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

  async listAll() {
    return this.lawyerModel.find().lean().exec();
  }

  async findById(id: string) {
    return this.lawyerModel.findById(id).exec();
  }
}
