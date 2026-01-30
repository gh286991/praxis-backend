import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { QuestionsService } from '../questions/questions.service';
import { SubjectsService } from '../questions/subjects.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Question, QuestionSchema } from '../questions/schemas/question.schema';
import { Tag, TagSchema } from '../questions/schemas/tag.schema';
import { QuestionsModule } from '../questions/questions.module';
import { CategoriesService } from '../questions/categories.service';
import { Subject, SubjectSchema } from '../questions/schemas/subject.schema';
import { Category, CategorySchema } from '../questions/schemas/category.schema';
import {
  UserProgress,
  UserProgressSchema,
} from '../questions/schemas/user-progress.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subject.name, schema: SubjectSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Question.name, schema: QuestionSchema },
      { name: Tag.name, schema: TagSchema },
      { name: UserProgress.name, schema: UserProgressSchema },
    ]),
    UsersModule,
  ],
  controllers: [ImportController],
  providers: [
    ImportService,
    QuestionsService,
    CategoriesService,
    SubjectsService,
  ],
  exports: [ImportService],
})
export class ImportModule {}
