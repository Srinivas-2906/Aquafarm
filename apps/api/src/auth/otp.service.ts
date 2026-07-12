import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OtpService {
  private codes = new Map<string, { code: string; expiresAt: Date }>();

  constructor(private config: ConfigService) {}

  async send(phoneNumber: string): Promise<string> {
    const mockEnabled = this.config.get('OTP_MOCK_ENABLED') === 'true';
    const code = mockEnabled
      ? this.config.get('OTP_MOCK_CODE') || '123456'
      : String(Math.floor(100000 + Math.random() * 900000));

    this.codes.set(phoneNumber, {
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    if (mockEnabled) {
      console.log(`[OTP Mock] ${phoneNumber}: ${code}`);
    }

    return code;
  }

  async verify(phoneNumber: string, otp: string): Promise<boolean> {
    const stored = this.codes.get(phoneNumber);
    if (!stored) return false;
    if (stored.expiresAt < new Date()) {
      this.codes.delete(phoneNumber);
      return false;
    }
    const valid = stored.code === otp;
    if (valid) this.codes.delete(phoneNumber);
    return valid;
  }
}
