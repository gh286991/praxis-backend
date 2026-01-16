import { Controller, Get, Query } from '@nestjs/common';
import { GeminiService, QuestionData } from './gemini.service';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Get('generate')
  async generate(@Query('topic') topic: string): Promise<QuestionData> {
    return this.geminiService.generateQuestion(topic);
  }
}
