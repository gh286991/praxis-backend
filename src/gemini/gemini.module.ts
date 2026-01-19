import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { GeminiController } from './gemini.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { Tag, TagSchema } from '../questions/schemas/tag.schema';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([{ name: Tag.name, schema: TagSchema }]),
  ],
  providers: [GeminiService],
  controllers: [GeminiController],
  exports: [GeminiService], // Export so QuestionsModule can use it
})
export class GeminiModule {}
