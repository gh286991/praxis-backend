import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuestionsService } from './questions.service';
import { QuestionsController } from './questions.controller';
import { SubjectsService } from './subjects.service';
import { SubjectsController } from './subjects.controller';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { MigrationService } from './migration.service';
import { Question, QuestionSchema } from './schemas/question.schema';
import { UserProgress, UserProgressSchema } from './schemas/user-progress.schema';
import { Subject, SubjectSchema } from './schemas/subject.schema';
import { Category, CategorySchema } from './schemas/category.schema';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
      { name: UserProgress.name, schema: UserProgressSchema },
      { name: Subject.name, schema: SubjectSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
    GeminiModule,
  ],
  controllers: [
    QuestionsController,
    SubjectsController,
    CategoriesController,
    StatsController,
  ],
  providers: [
    QuestionsService,
    SubjectsService,
    CategoriesService,
    StatsService,
    MigrationService,
  ],
  exports: [MigrationService],
})
export class QuestionsModule {}
