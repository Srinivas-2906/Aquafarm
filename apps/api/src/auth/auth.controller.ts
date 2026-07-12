import { Body, Controller, Post, Get, Res, Req, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength, MaxLength, Length } from 'class-validator';
import { Response, Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/auth.guards';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { ConfigService } from '@nestjs/config';

class LoginDto {
  @ApiProperty({ example: '9876543210' })
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
  async activate(@Body() dto: ActivateDto) {
    return this.auth.activate(dto.phoneNumber, dto.activationCode, dto.pin, dto.displayName);
  }

  @Post('request-otp')
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phoneNumber);
  }

  @Post('reset-pin')
  async resetPin(@Body() dto: ResetPinDto) {
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
