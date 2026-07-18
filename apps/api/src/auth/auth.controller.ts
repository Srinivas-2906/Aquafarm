import { Body, Controller, Post, Get, Res, Req, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength, MaxLength, Length, IsOptional } from 'class-validator';
import { Response, Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard, RolesGuard } from '../common/guards/auth.guards';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';

class LoginDto {
  @ApiProperty({ example: '9985533376' })
  @IsString()
  @Matches(/^[6-9]\d{9}$/)
  phoneNumber!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  pin!: string;
}

class ActivateDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[6-9]\d{9}$/)
  phoneNumber!: string;

  @ApiProperty()
  @IsString()
  @MinLength(4)
  activationCode!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^\d{6}$/)
  pin!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;
}

class ResetPinDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[6-9]\d{9}$/)
  phoneNumber!: string;

  @ApiProperty()
  @IsString()
  @Length(6)
  otp!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^\d{6}$/)
  newPin!: string;
}

class RequestOtpDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[6-9]\d{9}$/)
  phoneNumber!: string;
}

class InviteSupervisorDto {
  @ApiProperty({ example: 'farm-uuid' })
  @IsString()
  farmId!: string;

  @ApiProperty({ example: '9985533376' })
  @IsString()
  @Matches(/^[6-9]\d{9}$/)
  phoneNumber!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  pin!: string;
}

class SetPinDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  newPin!: string;
}

class OwnerSignupDto {
  @ApiProperty({ example: 'Sandhya Aqua Farms' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  organizationName!: string;

  @ApiProperty({ example: 'Owner Name' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  ownerName!: string;

  @ApiProperty({ example: '9985533376' })
  @IsString()
  @Matches(/^[6-9]\d{9}$/)
  phoneNumber!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  pin!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  confirmPin!: string;
}

class PinResetRequestDto {
  @ApiProperty({ example: '9985533376' })
  @IsString()
  @Matches(/^[6-9]\d{9}$/)
  phoneNumber!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private config: ConfigService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(
      dto.phoneNumber,
      dto.pin,
      req.headers['user-agent'],
      req.ip,
    );
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('activate')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async activate(@Body() dto: ActivateDto) {
    if (process.env.NODE_ENV === 'production' && process.env.AUTH_ACTIVATION_ENABLED !== 'true') {
      return { message: 'Activation is disabled' };
    }
    return this.auth.activate(dto.phoneNumber, dto.activationCode, dto.pin, dto.displayName);
  }

  @Post('request-otp')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async requestOtp(@Body() dto: RequestOtpDto) {
    if (process.env.NODE_ENV === 'production' && process.env.AUTH_OTP_ENABLED !== 'true') {
      return { message: 'OTP is disabled' };
    }
    return this.auth.requestOtp(dto.phoneNumber);
  }

  @Post('reset-pin')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPin(@Body() dto: ResetPinDto) {
    if (process.env.NODE_ENV === 'production' && process.env.AUTH_OTP_ENABLED !== 'true') {
      return { message: 'OTP reset is disabled' };
    }
    return this.auth.resetPin(dto.phoneNumber, dto.otp, dto.newPin);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
    const tokens = await this.auth.refresh(refreshToken);
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return tokens;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    await this.auth.logout(refreshToken);
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async me(@CurrentUser('sub') userId: string) {
    return this.auth.getMe(userId);
  }

  @Post('invite-supervisor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @ApiBearerAuth()
  async inviteSupervisor(
    @Body() dto: InviteSupervisorDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.auth.inviteSupervisor(dto, { userId, organizationId });
  }

  @Post('set-pin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async setPin(@Body() dto: SetPinDto, @CurrentUser('sub') userId: string) {
    return this.auth.setPin(userId, dto.newPin);
  }

  @Post('signup-owner')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  async signupOwner(
    @Body() dto: OwnerSignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.signupOwner(dto, req.headers['user-agent'], req.ip);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('pin-reset-request')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(200)
  async pinResetRequest(@Body() dto: PinResetRequestDto) {
    return this.auth.requestPinReset(dto.phoneNumber, dto.message);
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    const secure = this.config.get('COOKIE_SECURE') === 'true';
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
