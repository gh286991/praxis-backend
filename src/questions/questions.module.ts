import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuestionsService } from './questions.service';
import { QuestionsController } from './questions.controller';
import { SubjectsService } from './subjects.service';
import { SubjectsController } from './subjects.controller';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { TagsService } from './tags.service';
import { TagsController } from './tags.controller';
import { MigrationService } from './migration.service';
import { Question, QuestionSchema } from './schemas/question.schema';
import {
  UserProgress,
  UserProgressSchema,
} from './schemas/user-progress.schema';
import { Subject, SubjectSchema } from './schemas/subject.schema';
import { Category, CategorySchema } from './schemas/category.schema';
import { Tag, TagSchema } from './schemas/tag.schema';
import { GeminiModule } from '../gemini/gemini.module';
import { UsersModule } from '../users/users.module';
import { ExecutionModule } from '../execution/execution.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
      { name: UserProgress.name, schema: UserProgressSchema },
      { name: Subject.name, schema: SubjectSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Tag.name, schema: TagSchema },
    ]),
    forwardRef(() => GeminiModule),
    forwardRef(() => ExecutionModule),
    UsersModule,
  ],
  controllers: [
    QuestionsController,
    SubjectsController,
    CategoriesController,
    StatsController,
    TagsController,
  ],
  providers: [
    QuestionsService,
    SubjectsService,
    CategoriesService,
    StatsService,
    MigrationService,
    TagsService,
  ],
  exports: [MigrationService, QuestionsService, TagsService],
})
export class QuestionsModule {}
