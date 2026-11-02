import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { Company, CompanyDocument } from '../cases/schemas/company.schema';
import { Lawyer, LawyerDocument } from '../cases/schemas/lawyer.schema';
import {
  SEED_ADMINS,
  SEED_CASE_MANAGERS,
  SEED_COMPANIES,
  SEED_COMPANY_DETAILS,
  SeedUser,
} from './seed-accounts';

const DEFAULT_SEED_PASSWORD = 'prenup1234';

/**
 * Recreates the QA accounts (admins, case managers, companies and their
 * lawyers) when the database has no users, e.g. after it was wiped.
 *
 * Opt-in: nothing happens unless SEED_TEST_ACCOUNTS=true. The accounts share
 * one known password (SEED_ACCOUNTS_PASSWORD, default "prenup1234") and include
 * admins, so never leave this enabled on a database holding real users' data
 * longer than needed. It only ever runs while the users collection is empty,
 * so it cannot touch or overwrite an existing database.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Lawyer.name) private lawyerModel: Model<LawyerDocument>,
  ) {}

  async onApplicationBootstrap() {
    const enabled =
      (this.config.get<string>('SEED_TEST_ACCOUNTS') || '').trim().toLowerCase() === 'true';
    if (!enabled) return;

    // A failed seed must never stop the API from starting.
    try {
      await this.seedIfNoUsers();
    } catch (err: any) {
      if (err?.code === 11000) {
        this.logger.warn('Seed skipped: the accounts were created concurrently.');
        return;
      }
      this.logger.error('Failed to seed test accounts', err?.stack || err);
    }
  }

  private async seedIfNoUsers() {
    if (await this.userModel.exists({})) {
      this.logger.log('Users already exist; not seeding test accounts.');
      return;
    }

    const password = this.config.get<string>('SEED_ACCOUNTS_PASSWORD') || DEFAULT_SEED_PASSWORD;
    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      password === DEFAULT_SEED_PASSWORD
    ) {
      this.logger.warn(
        'Seeding test accounts on production with the default password. Change it, or set SEED_ACCOUNTS_PASSWORD.',
      );
    }

    this.logger.log('No users found; seeding test accounts...');
    let users = 0;

    for (const u of SEED_ADMINS) {
      await this.createUser(u, 'admin', password);
      users++;
    }
    for (const u of SEED_CASE_MANAGERS) {
      await this.createUser(u, 'case_manager', password);
      users++;
    }

    for (const c of SEED_COMPANIES) {
      const company =
        (await this.companyModel.findOne({ email: c.email }).exec()) ??
        (await this.companyModel.create({
          name: c.name,
          companyNumber: c.companyNumber,
          email: c.email,
          notes: 'Test company seeded for QA',
          ...SEED_COMPANY_DETAILS,
        }));

      for (const l of c.lawyers) {
        const user = await this.createUser(l, 'lawyer', password);
        users++;

        // The lawyer link is read through Lawyer.user in the lawyer portal and
        // through Lawyer.userId / User.lawyerProfile in the admin flow; set all.
        const link = { company: company._id, user: user._id, userId: user._id };
        const lawyer =
          (await this.lawyerModel
            .findOneAndUpdate({ externalId: l.externalId }, link, { new: true })
            .exec()) ??
          (await this.lawyerModel.create({
            externalId: l.externalId,
            name: `${l.firstName} ${l.lastName}`,
            firstName: l.firstName,
            lastName: l.lastName,
            jobTitle: 'Solicitor',
            status: 'available',
            workEmail: l.email,
            publicEmail: l.email,
            directEmail: l.email,
            notes: 'Test lawyer seeded for QA',
            createdBy: 'seed',
            ...link,
          }));

        user.lawyerProfile = lawyer._id;
        await user.save();
      }
    }

    this.logger.log(
      `Seeded ${users} users and ${SEED_COMPANIES.length} companies. Change these passwords before real use.`,
    );
  }

  private async createUser(
    seed: SeedUser,
    role: 'admin' | 'case_manager' | 'lawyer',
    password: string,
  ) {
    return this.userModel.create({
      email: seed.email,
      passwordHash: await this.usersService.hashPassword(password),
      firstName: seed.firstName,
      lastName: seed.lastName,
      role,
      acceptedTerms: true,
      emailVerified: true,
    });
  }
}
