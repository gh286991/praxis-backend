import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsageLog, UsageLogDocument } from './schemas/usage-log.schema';

@Injectable()
export class UsageService {
  constructor(
    @InjectModel(UsageLog.name) private usageLogModel: Model<UsageLogDocument>,
  ) {}

  async logUsage(
    userId: string | Types.ObjectId,
    model: string,
    endpoint: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<UsageLog> {
    const totalTokens = inputTokens + outputTokens;
    
    // Handle invalid or missing userId
    let userObjectId: Types.ObjectId;
    if (!userId || userId === 'system') {
      // Use a special system user ID (all zeros is a valid ObjectId)
      userObjectId = new Types.ObjectId('000000000000000000000000');
    } else if (typeof userId === 'string') {
      try {
        userObjectId = new Types.ObjectId(userId);
      } catch (error) {
        console.warn(`Invalid userId format: ${userId}, using system user`);
        userObjectId = new Types.ObjectId('000000000000000000000000');
      }
    } else {
      userObjectId = userId;
    }
    
    const log = new this.usageLogModel({
      userId: userObjectId,
      model,
      endpoint,
      inputTokens,
      outputTokens,
      totalTokens,
    });
    return log.save();
  }
}
