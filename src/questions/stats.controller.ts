import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { StatsService, SubjectStats } from './stats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  async getAllStats(@Req() req: any): Promise<SubjectStats[]> {
    const userId = req.user.sub;
    return this.statsService.getAllSubjectsStats(userId);
  }

  @Get('subject/:slug')
  async getSubjectStats(
    @Req() req: any,
    @Param('slug') slug: string,
  ): Promise<SubjectStats | null> {
    const userId = req.user.sub;
    return this.statsService.getSubjectStats(userId, slug);
  }
}
