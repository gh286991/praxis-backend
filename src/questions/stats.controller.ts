import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { StatsService, SubjectStats } from './stats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@SkipThrottle()
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('platform')
  async getPlatformStats() {
    return this.statsService.getPlatformStats();
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAllStats(@Req() req: any): Promise<SubjectStats[]> {
    const userId = req.user.sub;
    return this.statsService.getAllSubjectsStats(userId);
  }

  @Get('subject/:slug')
  @UseGuards(JwtAuthGuard)
  async getSubjectStats(
    @Req() req: any,
    @Param('slug') slug: string,
  ): Promise<SubjectStats | null> {
    const userId = req.user.sub;
    return this.statsService.getSubjectStats(userId, slug);
  }
}
