import { Module, forwardRef } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { QuestionsModule } from '../questions/questions.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [forwardRef(() => QuestionsModule), forwardRef(() => GeminiModule)],
  providers: [ExecutionService],
  controllers: [ExecutionController],
  exports: [ExecutionService],
})
export class ExecutionModule {}
