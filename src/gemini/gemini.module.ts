import { Module, forwardRef } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { GeminiController } from './gemini.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { Tag, TagSchema } from '../questions/schemas/tag.schema';
import { Question, QuestionSchema } from '../questions/schemas/question.schema';
import { ExecutionModule } from '../execution/execution.module';
import { GeminiLogService } from './gemini-log.service';
import { QuestionGenerationService } from './question-generation.service';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Tag.name, schema: TagSchema },
      { name: Question.name, schema: QuestionSchema },
    ]),
    forwardRef(() => ExecutionModule),
  ],
  providers: [GeminiService, GeminiLogService, QuestionGenerationService],
  controllers: [GeminiController],
  exports: [GeminiService], // Export so QuestionsModule can use it
})
export class GeminiModule {}
