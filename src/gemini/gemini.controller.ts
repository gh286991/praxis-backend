import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GeminiService } from './gemini.service';
import { QuestionData } from './types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EnergyGuard } from '../auth/guards/energy.guard';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @UseGuards(JwtAuthGuard, EnergyGuard, ThrottlerGuard)
  @Get('generate')
  async generate(@Query('topic') topic: string): Promise<QuestionData> {
    return this.geminiService.generateQuestion(topic);
  }
}
