import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsageService } from './usage.service';

@Controller('usage')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  /**
   * Get current user's AI usage statistics
   */
  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async getUserUsageStats(@Request() req) {
    return this.usageService.getUserStats(req.user._id);
  }

  /**
   * Get current user's usage history
   */
  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getUserUsageHistory(
    @Request() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    return this.usageService.getUserHistory(req.user._id, fromDate, toDate);
  }
}
