// jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { userDisplayName } from './request-context';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private usersService: UsersService, config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: any) => {
          if (!req) return null;
          // 1) check cookie
          if (req.cookies && req.cookies.access_token) {
            return req.cookies.access_token;
          }
          // 2) check Authorization header "Bearer TOKEN"
          const authHeader = req.headers?.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.split(' ')[1];
          }
          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findById(payload.id);
    // A deactivated account loses access immediately, not when its token expires.
    if (!user || user.active === false) return null;
    return {
      id: user._id,
      email: user.email,
      role: user.role,
      endUserType: user.endUserType,
      name: userDisplayName(user),
    };
  }
}
