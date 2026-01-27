import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserProfileDocument = UserProfile & Document;

@Schema({ timestamps: true })
export class UserProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop()
  displayName: string;

  @Prop()
  bio: string;

  @Prop({ default: 0 })
  totalQuestionsCompleted: number;

  @Prop({ default: 0 })
  totalCorrectAnswers: number;

  @Prop({ default: 0 })
  totalTimeSpent: number; // in seconds

  @Prop({ default: 10.0, type: Number })
  availableCredits: number; // Available AI credits

  @Prop({ default: 10.0, type: Number })
  totalCreditsGranted: number; // Total credits ever granted (for calculating usage percentage)

  @Prop({ default: 0 })
  totalQuestionsPassed: number;

  @Prop({ default: 0 })
  totalTokensUsed: number;

  @Prop({ default: Date.now })
  joinedAt: Date;
}

export const UserProfileSchema = SchemaFactory.createForClass(UserProfile);
