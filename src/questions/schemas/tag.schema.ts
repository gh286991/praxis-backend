import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum TagCategory {
  CONCEPT = 'concept', // 基礎概念 (Loops, Variables)
  DATA_STRUCTURE = 'data_structure', // 資料結構 (List, Dict)
  ALGORITHM = 'algorithm', // 演算法 (Sorting, Search)
  LANGUAGE_FEATURE = 'language_feature', // 語言特性 (List Comprehension)
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class Tag extends Document {
  @Prop({ required: true })
  name: string; // 標籤顯示名稱 (e.g. "Recursion")

  @Prop({ required: true, unique: true })
  slug: string; // 唯一識別碼 (e.g. "recursion")

  @Prop({ required: true, enum: TagCategory, default: TagCategory.CONCEPT })
  type: TagCategory; // 標籤類別

  @Prop({ required: false })
  language?: string; // 適用語言 (e.g. "python"). 若為空則為通用

  @Prop({ default: '' })
  description: string;

  @Prop({ default: 0 })
  usedCount: number; // 引用次數統計
}

export const TagSchema = SchemaFactory.createForClass(Tag);
