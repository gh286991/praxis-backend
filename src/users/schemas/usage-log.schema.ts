import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UsageLogDocument = UsageLog & Document;

@Schema()
export class UsageLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  model: string;

  @Prop({ required: true })
  endpoint: string;

  @Prop({ required: true })
  inputTokens: number;

  @Prop({ required: true })
  outputTokens: number;

  @Prop({ required: true })
  totalTokens: number;

  @Prop({ default: Date.now })
  timestamp: Date;
}

export const UsageLogSchema = SchemaFactory.createForClass(UsageLog);
