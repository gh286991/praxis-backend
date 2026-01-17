import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { QuestionData } from './types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @UseGuards(JwtAuthGuard)
  @Get('generate')
  async generate(@Query('topic') topic: string): Promise<QuestionData> {
    return this.geminiService.generateQuestion(topic);
  }
}
