import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Subject extends Document {
  @Prop({ required: true, unique: true })
  name: string; // 'Python 基礎', 'Python AI', 'JavaScript'

  @Prop({ required: true, unique: true })
  slug: string; // 'python-basic', 'python-ai', 'javascript'

  @Prop({ default: '' })
  description: string; // 題庫描述

  @Prop({ required: true })
  language: string; // 'python', 'javascript', 'java'

  @Prop({ default: '📚' })
  icon: string; // 圖標 emoji

  @Prop({ default: '#3B82F6' })
  color: string; // 主題色

  @Prop({ default: true })
  isActive: boolean; // 是否啟用
}

export const SubjectSchema = SchemaFactory.createForClass(Subject);
