import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(payload: Partial<User>): Promise<UserDocument> {
    // payload must include passwordHash
    const created = new this.userModel(payload);
    return created.save();
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  async hashPassword(password: string) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async comparePassword(password: string, hash: string) {
    return bcrypt.compare(password, hash);
  }

  async setResetToken(userId: string, token: string, expires: Date) {
    return this.userModel.findByIdAndUpdate(userId, { resetPasswordToken: token, resetPasswordExpires: expires }).exec();
  }

  async clearResetToken(userId: string) {
    return this.userModel.findByIdAndUpdate(userId, { resetPasswordToken: null, resetPasswordExpires: null }).exec();
  }

  async updatePassword(userId: string, passwordHash: string) {
    return this.userModel.findByIdAndUpdate(userId, { passwordHash, resetPasswordToken: null, resetPasswordExpires: null }).exec();
  }
  
  generateRandomPassword(length = 12): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
