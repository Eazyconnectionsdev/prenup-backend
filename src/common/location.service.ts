// src/common/location.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { getLocation } from '../utils/get-location';

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Resolve the geo-location for an IP and persist it on the user document.
   *
   * @param userId  Mongo ObjectId string of the user.
   * @param ip      Raw IP address string (may be undefined / null / loopback).
   * @param type    `'registration'` → writes registrationIp + registrationLocation.
   *                `'login'`        → writes lastLoginIp + lastLocation.
   *
   * Fire-and-forget: errors are swallowed so they never break the caller flow.
   */
  async capture(
    userId: string,
    ip: string | null | undefined,
    type: 'registration' | 'login',
  ): Promise<void> {
    if (!userId || !ip) return;

    try {
      const cleanIp = this.extractIp(ip);
      if (!cleanIp) return;

      const geo = await getLocation(cleanIp);

      const update: Record<string, any> =
        type === 'registration'
          ? {
              registrationIp: cleanIp,
              registrationLocation: geo ?? null,
            }
          : {
              lastLoginIp: cleanIp,
              lastLocation: geo ?? null,
            };

      await this.userModel
        .findByIdAndUpdate(new Types.ObjectId(userId), { $set: update })
        .exec();
    } catch (err) {
      this.logger.warn(`LocationService.capture failed for user ${userId}`, err);
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * Strip IPv6-mapped IPv4 prefix (`::ffff:`) and ignore loopbacks /
   * private ranges that the external API cannot resolve.
   */
  private extractIp(raw: string): string | null {
    const ip = raw.replace(/^::ffff:/, '').trim();

    // Skip loopback / private / link-local
    if (
      ip === '::1' ||
      ip === '127.0.0.1' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
    ) {
      return null;
    }

    return ip || null;
  }
}

