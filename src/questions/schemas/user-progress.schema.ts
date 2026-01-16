import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class UserProgress extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Subject', required: false })
  subjectId?: Types.ObjectId; // 新架構：關聯到 Subject

  @Prop({ type: Types.ObjectId, ref: 'Category', required: false })
  categoryId?: Types.ObjectId; // 新架構：關聯到 Category

  @Prop({ type: Types.ObjectId, ref: 'Question', required: true })
  questionId: Types.ObjectId;

  @Prop({ required: true })
  category: string; // 舊架構保留向下兼容 (deprecated)

  @Prop({ default: '' })
  code: string; // Last submitted code

  @Prop({ required: true })
  isCorrect: boolean; // Best result (ever passed)

  @Prop({ default: 0 })
  attemptCount: number; // Total attempts

  @Prop({ default: 0 })
  passedCount: number; // Times passed

  @Prop({ default: 0 })
  failedCount: number; // Times failed

  @Prop({ default: Date.now })
  attemptedAt: Date; // Last attempt time

  @Prop({ default: Date.now })
  firstAttemptedAt: Date; // First time seeing this question
}

export const UserProgressSchema = SchemaFactory.createForClass(UserProgress);

// Create compound index to ensure one record per user per question
UserProgressSchema.index({ userId: 1, questionId: 1 }, { unique: true });
