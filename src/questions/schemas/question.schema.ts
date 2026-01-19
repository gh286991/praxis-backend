import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

interface Sample {
  input: string;
  output: string;
  explanation?: string;
}

interface TestCase {
  input: string;
  output: string;
  type?: 'normal' | 'edge' | 'corner';
  description?: string;
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
  sampleInput: string; // 保留向後相容：第一組範例的 input

  @Prop({ default: '' })
  sampleOutput: string; // 保留向後相容：第一組範例的 output

  @Prop({ type: Array, default: [] })
  samples: Sample[]; // 新增：4-5 組範例

  @Prop({ type: Array, default: [] })
  testCases: TestCase[]; // 改進：10-20 個測試案例

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Tag' }], default: [] })
  tags: Types.ObjectId[]; // 新增：題目標籤 (關聯到 Tag)

  @Prop({ type: String, enum: ['easy', 'medium', 'hard'], required: false })
  difficulty?: string; // 新增：難度

  @Prop({ required: false })
  constraints?: string; // 新增：特殊約束說明

  @Prop({ default: 0 })
  usedCount: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  generatedBy?: Types.ObjectId; // 產生此題目的使用者

  @Prop({ required: false })
  generatedAt?: Date; // 題目產生時間

  @Prop({ default: false })
  isAIGenerated: boolean; // 是否為 AI 產生（true）或從資料庫取得（false）
}

export const QuestionSchema = SchemaFactory.createForClass(Question);
