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

  @Prop({ default: 0 })
  order: number; // 排序順序
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// 創建複合索引確保同一 subject 下 slug 唯一
CategorySchema.index({ subjectId: 1, slug: 1 }, { unique: true });
