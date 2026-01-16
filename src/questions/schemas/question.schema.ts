import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type QuestionDocument = HydratedDocument<Question>;

@Schema()
export class TestCase {
  @Prop()
  input: string;

  @Prop()
  output: string;
}

@Schema({ timestamps: true })
export class Question {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop()
  sampleInput: string;

  @Prop()
  sampleOutput: string;

  @Prop([TestCase])
  testCases: TestCase[];
}

export const QuestionSchema = SchemaFactory.createForClass(Question);
