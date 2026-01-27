import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Category extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Subject', required: true })
  subjectId: Types.ObjectId; // 關聯到 Subject

  @Prop({ required: true })
  name: string; // '第1類：基本程式設計', 'React Hooks'

  @Prop({ required: true })
  slug: string; // 'category1', 'react-hooks'

  @Prop({ default: '' })
  description: string;

  @Prop({ default: 'CHAPTER' })
  type: 'CHAPTER' | 'EXAM'; // 單元類型

  @Prop({ required: false })
  duration?: number; // 考試時間限制 (分鐘)

  @Prop({ required: false })
  passScore?: number; // 及格分數

  @Prop({ default: '' })
  guidelines: string; // AI 出題準則 (Markdown format)

  @Prop({ default: 0 })
  order: number; // 排序順序
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// 創建複合索引確保同一 subject 下 slug 唯一
CategorySchema.index({ subjectId: 1, slug: 1 }, { unique: true });
