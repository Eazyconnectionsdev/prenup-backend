import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Lawyer } from '../schemas/lawyer.schema';
import { User } from '../../users/schemas/user.schema';
import { S3Service } from '../../common/s3.service';
import { lawyerIdsForUser } from '../case-access.util';
import { ChangeMyPasswordDto, UpdateMyLawyerProfileDto } from './dto/update-my-lawyer-profile.dto';

export const MAX_MY_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * The signed-in lawyer editing their own profile (the lawyer portal's
 * profile window). Fields are stored exactly as the admin lawyer form stores
 * them (AdminService.buildLawyerFields), including the legacy mirrors older
 * code reads, so both screens always agree.
 */
@Injectable()
export class LawyerProfileService {
  constructor(
    @InjectModel(Lawyer.name) private readonly lawyerModel: Model<any>,
    @InjectModel(User.name) private readonly userModel: Model<any>,
    private readonly s3Service: S3Service,
  ) {}

  /** The signed-in lawyer's own profile document. */
  private async myLawyer(userId: string): Promise<any> {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid user');
    const ids = [...(await lawyerIdsForUser({ user: this.userModel, lawyer: this.lawyerModel }, userId))]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const lawyer = await this.lawyerModel.findOne({ _id: { $in: ids } }).exec();
    if (!lawyer) throw new NotFoundException('No lawyer profile is linked to this account');
    return lawyer;
  }

  private async checkPassword(userId: string, password?: string) {
    const user: any = await this.userModel.findById(userId).select('+passwordHash').lean().exec();
    if (!user) throw new NotFoundException('Account not found');
    const ok = password && user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) throw new UnauthorizedException('Your current password is not correct');
    return user;
  }

  async updateMine(userId: string, dto: UpdateMyLawyerProfileDto) {
    const lawyer = await this.myLawyer(userId);
    const account: any = await this.userModel.findById(userId).lean().exec();
    if (!account) throw new NotFoundException('Account not found');

    const email = dto.workEmail.trim().toLowerCase();
    const emailChanged = email !== String(account.email ?? '').toLowerCase();
    if (emailChanged) {
      // The work email is also the sign-in address: confirm it is really them.
      await this.checkPassword(userId, dto.currentPassword);
      if (await this.userModel.exists({ email, _id: { $ne: account._id } })) {
        throw new ConflictException('Another account already uses this email address');
      }
    }

    const set: Record<string, any> = {};
    const unset: Record<string, ''> = {};
    const put = (key: string, value: string | undefined, mirror?: string) => {
      const v = value?.trim();
      for (const k of mirror ? [key, mirror] : [key]) {
        if (v) set[k] = v;
        else unset[k] = '';
      }
    };
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    const middleName = dto.middleName?.trim();
    set.firstName = firstName;
    set.lastName = lastName;
    set.name = [firstName, middleName, lastName].filter(Boolean).join(' ');
    set.jobTitle = dto.jobTitle.trim();
    set.workEmail = email;
    set.directEmail = email; // read by older code
    put('middleName', dto.middleName);
    put('officeBranch', dto.officeBranch);
    put('regulatoryBody', dto.regulatoryBody);
    put('registrationNumber', dto.registrationNumber, 'barNumber');
    put('practisingStatus', dto.practisingStatus);
    put('jurisdiction', dto.jurisdiction);
    put('qualifications', dto.qualifications);
    put('priceText', dto.priceText);
    put('workPhone', dto.workPhone, 'directPhone');
    put('mobilePhone', dto.mobilePhone);
    // The public email follows the work email unless an admin set a different one.
    const previousWork = lawyer.workEmail ?? lawyer.directEmail;
    if (!lawyer.publicEmail || lawyer.publicEmail === previousWork) set.publicEmail = email;

    try {
      await this.userModel
        .updateOne(
          { _id: account._id },
          {
            $set: {
              firstName,
              middleName: middleName || null,
              lastName,
              email,
              phone: dto.mobilePhone?.trim() || dto.workPhone?.trim() || null,
            },
          },
        )
        .exec();
    } catch (err: any) {
      if (err?.code === 11000) throw new ConflictException('Another account already uses this email address');
      throw err;
    }
    await this.lawyerModel
      .updateOne({ _id: lawyer._id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { runValidators: true })
      .exec();

    return this.profile(userId);
  }

  async changePassword(userId: string, dto: ChangeMyPasswordDto) {
    await this.myLawyer(userId);
    await this.checkPassword(userId, dto.currentPassword);
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Choose a password different from your current one');
    }
    await this.userModel
      .updateOne(
        { _id: new Types.ObjectId(userId) },
        {
          $set: {
            passwordHash: await bcrypt.hash(dto.newPassword, 10),
            // A new password retires any pending "choose a password" link.
            resetPasswordToken: null,
            resetPasswordExpires: null,
          },
        },
      )
      .exec();
    return { success: true };
  }

  async setPhoto(userId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('A photo is required');
    if (file.size > MAX_MY_PHOTO_BYTES) throw new BadRequestException('Photo is larger than 5 MB');
    const mimeType = PHOTO_TYPES[path.extname(file.originalname).toLowerCase()];
    if (!mimeType) throw new BadRequestException('Unsupported image type. Upload a PNG, JPG or WebP');
    const lawyer = await this.myLawyer(userId);
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    // Same key layout as the admin upload, so both read the same photo.
    const photoKey = `lawyer-photos/${lawyer._id}/${randomUUID()}-${safeName}`;
    await this.s3Service.putToBucket(file.buffer, photoKey, mimeType);
    const previous = lawyer.photoKey;
    await this.lawyerModel.updateOne({ _id: lawyer._id }, { $set: { photoKey, photoMimeType: mimeType } }).exec();
    if (previous) await this.s3Service.deleteFromBucket(previous).catch(() => undefined);
    return { hasPhoto: true };
  }

  async getPhoto(userId: string) {
    const lawyer = await this.myLawyer(userId);
    if (!lawyer.photoKey) throw new NotFoundException('No photo');
    const buffer = await this.s3Service.getFromBucket(lawyer.photoKey);
    return { buffer, mimeType: (lawyer.photoMimeType as string) || 'application/octet-stream' };
  }

  async removePhoto(userId: string) {
    const lawyer = await this.myLawyer(userId);
    await this.lawyerModel.updateOne({ _id: lawyer._id }, { $unset: { photoKey: '', photoMimeType: '' } }).exec();
    if (lawyer.photoKey) await this.s3Service.deleteFromBucket(lawyer.photoKey).catch(() => undefined);
    return { hasPhoto: false };
  }

  /** What the profile window shows: the profile, the firm, and the account. */
  async profile(userId: string) {
    const lawyer: any = await this.lawyerModel
      .findById((await this.myLawyer(userId))._id)
      .populate('company', 'name website email phone address city postcode country')
      .lean()
      .exec();
    const user: any = await this.userModel
      .findById(userId)
      .select('firstName middleName lastName email phone createdAt lastLoginAt')
      .lean()
      .exec();
    const { photoKey, photoMimeType, ...rest } = lawyer ?? {};
    return { lawyer: { ...rest, hasPhoto: Boolean(photoKey) }, user };
  }
}
