import { Controller, Get, Put, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    return this.usersService.getUserProfileWithStats(req.user._id.toString());
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(@Request() req, @Body() updateDto: UpdateProfileDto) {
    await this.usersService.updateProfile(req.user._id.toString(), updateDto);
    // Return the full profile with stats after update
    return this.usersService.getUserProfileWithStats(req.user._id.toString());
  }
}
