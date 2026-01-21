import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { COOKIE_OPTIONS } from '../config/cookie.config';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Initiates the Google OAuth flow
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res: Response) {
    const { access_token } = await this.authService.login(req.user);
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    res.cookie('jwt_token', access_token, COOKIE_OPTIONS);

    res.redirect(`${frontendUrl}`);
  }

  @Post('dev/login')
  async devLogin(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    const { access_token, user } = await this.authService.loginDev(body);

    res.cookie('jwt_token', access_token, COOKIE_OPTIONS);

    return { success: true, user };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('jwt_token', COOKIE_OPTIONS);
    return { success: true };
  }
}
