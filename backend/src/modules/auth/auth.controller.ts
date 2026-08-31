import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { readCookie } from '../../common/utils/cookie.util';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { ConfirmRecoveryDto, RequestRecoveryDto } from './dto/recovery.dto';

const ACCESS_COOKIE = 'icar_access';
const REFRESH_COOKIE = 'icar_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const issued = await this.authService.login(dto, this.requestContext(request));
    this.setCookies(response, issued);
    return { user: issued.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const issued = await this.authService.refresh(
      readCookie(request.headers.cookie, REFRESH_COOKIE),
      this.requestContext(request),
    );
    this.setCookies(response, issued);
    return { user: issued.user };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.logout(user, this.requestContext(request));
    this.clearCookies(response);
    return result;
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.changePassword(user, dto);
    this.clearCookies(response);
    return result;
  }

  @Public()
  @Post('recovery/request')
  @HttpCode(200)
  requestRecovery(@Body() dto: RequestRecoveryDto) {
    return this.authService.requestRecovery(dto);
  }

  @Public()
  @Post('recovery/confirm')
  @HttpCode(200)
  confirmRecovery(@Body() dto: ConfirmRecoveryDto) {
    return this.authService.confirmRecovery(dto);
  }

  private setCookies(
    response: Response,
    issued: { accessToken: string; refreshToken: string; accessTtlSeconds: number; refreshTtlSeconds: number },
  ): void {
    const secure = this.config.get<string>('NODE_ENV') === 'production';
    response.cookie(ACCESS_COOKIE, issued.accessToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure,
      maxAge: issued.accessTtlSeconds * 1000,
      path: '/',
    });
    response.cookie(REFRESH_COOKIE, issued.refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure,
      maxAge: issued.refreshTtlSeconds * 1000,
      path: '/api/auth',
    });
  }

  private clearCookies(response: Response): void {
    response.clearCookie(ACCESS_COOKIE, { path: '/' });
    response.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  private requestContext(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }
}

