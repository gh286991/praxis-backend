import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsageLog, UsageLogDocument } from './schemas/usage-log.schema';
import {
  UserProfile,
  UserProfileDocument,
} from './schemas/user-profile.schema';

@Injectable()
export class UsageService {
  constructor(
    @InjectModel(UsageLog.name) private usageLogModel: Model<UsageLogDocument>,
    @InjectModel(UserProfile.name)
    private userProfileModel: Model<UserProfileDocument>,
  ) {}

  /**
   * Check if user has enough energy for the request
   * @throws ForbiddenException if energy is insufficient
   */
  async checkEnergyAvailability(userId: string): Promise<boolean> {
    if (!userId) return true; // Skip check for anonymous/system users for now

    const objectId = new Types.ObjectId(userId);
    const profile = await this.userProfileModel.findOne({ userId: objectId });
    
    if (!profile) return true;

    // Check if daily reset is needed
    const now = new Date();
    const lastReset = new Date(profile.lastDailyReset || 0);
    
    // Reset if it's a new day (UTC)
    if (now.getUTCDate() !== lastReset.getUTCDate() || 
        now.getUTCMonth() !== lastReset.getUTCMonth() || 
        now.getUTCFullYear() !== lastReset.getUTCFullYear()) {
      profile.dailyTokensUsed = 0;
      profile.lastDailyReset = now;
      await profile.save();
      return true;
    }

    // Define limits (1 Energy = 1500 Tokens)
    const DAILY_LIMITS = {
      free: 5 * 1500,    // 7,500 Tokens
      pro: 100 * 1500,   // 150,000 Tokens
      team: Infinity,
    };

    const limit = DAILY_LIMITS[profile.planTier || 'free'];
    
    // Check if limit exceeded
    if (profile.dailyTokensUsed >= limit) {
      return false;
    }

    return true;
  }

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

    // Update user profile daily usage
    const profile = await this.userProfileModel.findOne({ userId: userObjectId });
    if (profile) {
      profile.dailyTokensUsed = (profile.dailyTokensUsed || 0) + totalTokens;
      profile.totalTokensUsed = (profile.totalTokensUsed || 0) + totalTokens;
      await profile.save();
    }

    const usageLog = new this.usageLogModel({
      userId: userObjectId,
      model,
      endpoint,
      inputTokens,
      outputTokens,
      totalTokens,
    });

    return usageLog.save();
  }

  /**
   * Get user's AI usage statistics
   */
  async getUserStats(userId: string) {
    const objectId = new Types.ObjectId(userId);
    const logs = await this.usageLogModel.find({ userId: objectId });

    // Calculate totals
    const totalTokens = logs.reduce((sum, log) => sum + log.totalTokens, 0);
    const totalInputTokens = logs.reduce(
      (sum, log) => sum + log.inputTokens,
      0,
    );
    const totalOutputTokens = logs.reduce(
      (sum, log) => sum + log.outputTokens,
      0,
    );
    const totalCalls = logs.length;

    // Group by endpoint
    const byEndpoint = logs.reduce((acc, log) => {
      const endpoint = log.endpoint;
      if (!acc[endpoint]) {
        acc[endpoint] = {
          calls: 0,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      acc[endpoint].calls += 1;
      acc[endpoint].totalTokens += log.totalTokens;
      acc[endpoint].inputTokens += log.inputTokens;
      acc[endpoint].outputTokens += log.outputTokens;
      return acc;
    }, {});

    // Group by model
    const byModel = logs.reduce((acc, log) => {
      const model = log.model;
      if (!acc[model]) {
        acc[model] = {
          calls: 0,
          totalTokens: 0,
        };
      }
      acc[model].calls += 1;
      acc[model].totalTokens += log.totalTokens;
      return acc;
    }, {});

    // Get user profile for credits information
    const profile = await this.userProfileModel.findOne({ userId: objectId });

    // Calculate credits used from logs
    const tokensPerCredit = parseInt(
      process.env.TOKENS_PER_CREDIT || '1500',
      10,
    );
    
    // Use stored values instead of calculating from logs for better performance and consistency with daily limits
    const availableCredits = profile
      ? Math.max(0, profile.availableCredits) // TODO: This field is deprecated in favor of daily limits, but kept for compatibility
      : 0;

    // Daily Limit Info
    // Daily Limit Info
    const DAILY_LIMITS = {
      free: 3 * 1500,    // 4,500 Tokens
      pro: 100 * 1500,
      team: Infinity,
    };
    const dailyLimit = DAILY_LIMITS[profile?.planTier || 'free'];
    const dailyUsed = profile?.dailyTokensUsed || 0;
    const purchasedBalance = profile?.purchasedEnergyBalance || 0;

    return {
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      totalCalls,
      byEndpoint,
      byModel,
      recentUsage: logs.slice(-10).reverse(), // Last 10 logs, most recent first
      credits: {
        // Daily Free Energy
        daily: {
           available: Math.max(0, (dailyLimit - dailyUsed) / tokensPerCredit),
           total: dailyLimit / tokensPerCredit,
           used: dailyUsed / tokensPerCredit,
        },
        // Wallet Energy
        wallet: {
           balance: purchasedBalance / tokensPerCredit,
        },
        // Legacy support/Total available for simple checks
        available: Math.max(0, (dailyLimit - dailyUsed + purchasedBalance) / tokensPerCredit),
        total: (dailyLimit + purchasedBalance) / tokensPerCredit,
        used: dailyUsed / tokensPerCredit,
        granted: dailyLimit / tokensPerCredit,
      },
      tokensPerCredit, // 返回转换比例给前端
      planTier: profile?.planTier || 'free',
    };
  }

  /**
   * Get user's usage history with optional date range
   */
  async getUserHistory(userId: string, from?: Date, to?: Date) {
    const objectId = new Types.ObjectId(userId);
    const query: any = { userId: objectId };

    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = from;
      if (to) query.createdAt.$lte = to;
    }

    const logs = await this.usageLogModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100); // Limit to last 100 records

    return logs;
  }
}
