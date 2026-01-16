import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

interface TestCase {
  input: string;
  output: string;
}

@Schema({ timestamps: true })
export class Question extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Subject', required: false })
  subjectId?: Types.ObjectId; // 新架構：關聯到 Subject

  @Prop({ type: Types.ObjectId, ref: 'Category', required: false })
  categoryId?: Types.ObjectId; // 新架構：關聯到 Category

  @Prop({ required: true, index: true })
  category: string; // 舊架構保留向下兼容 (deprecated)

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ default: '' })
  sampleInput: string;

  @Prop({ default: '' })
  sampleOutput: string;

  @Prop({ type: Array, default: [] })
  testCases: TestCase[];

  @Prop({ default: 0 })
  usedCount: number;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);
