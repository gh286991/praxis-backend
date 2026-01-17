import { Module } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { QuestionsModule } from '../questions/questions.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [QuestionsModule, GeminiModule],
  providers: [ExecutionService],
  controllers: [ExecutionController],
})
export class ExecutionModule {}
