import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UserProfile, UserProfileDocument } from './schemas/user-profile.schema';
import { UsageLog, UsageLogDocument } from './schemas/usage-log.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(UserProfile.name)
    private userProfileModel: Model<UserProfileDocument>,
    @InjectModel(UsageLog.name)
    private usageLogModel: Model<UsageLogDocument>,
  ) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleId }).exec();
  }

  async create(userData: Partial<User>): Promise<UserDocument> {
    // Assign default avatar if none provided
    if (!userData.picture) {
      const DEFAULT_AVATARS = [
        'https://api.dicebear.com/9.x/bottts/svg?seed=Cyber',
        'https://api.dicebear.com/9.x/bottts/svg?seed=Tech',
        'https://api.dicebear.com/9.x/bottts/svg?seed=Code',
        'https://api.dicebear.com/9.x/bottts/svg?seed=Nano',
        'https://api.dicebear.com/9.x/bottts/svg?seed=Bit',
      ];
      userData.picture =
        DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
    }

    const createdUser = new this.userModel(userData);
    return createdUser.save();
  }

  async findOne(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findOrCreateProfile(
    userId: string | Types.ObjectId,
  ): Promise<UserProfileDocument> {
    const objectId =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

    let profile = await this.userProfileModel.findOne({ userId: objectId });

    if (!profile) {
      profile = new this.userProfileModel({
        userId: objectId,
        displayName: 'Anonymous User',
        bio: '',
        totalQuestionsCompleted: 0,
        totalCorrectAnswers: 0,
        totalTimeSpent: 0,
        totalQuestionsPassed: 0,
        totalTokensUsed: 0,
        joinedAt: new Date(),
        availableCredits: 10.0,
        totalCreditsGranted: 10.0,
      });
      await profile.save();
    }

    return profile;
  }

  async getUserProfileWithStats(userId: string) {
    const user = await this.findOne(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const profile = await this.findOrCreateProfile(userId);

    // Calculate total tokens used from UsageLog
    const usageLogs = await this.usageLogModel
      .find({ userId: new Types.ObjectId(userId) })
      .exec();
    const totalTokensUsed = usageLogs.reduce(
      (sum, log) => sum + log.totalTokens,
      0,
    );

    return {
      // Basic user info
      email: user.email,
      name: user.name,
      picture: user.picture,

      // Profile info
      displayName: profile.displayName || user.name,
      bio: profile.bio,
      joinedAt: profile.joinedAt,

      // Stats
      totalQuestionsCompleted: profile.totalQuestionsCompleted,
      totalQuestionsPassed: profile.totalQuestionsPassed,
      totalTokensUsed,
    };
  }

  async updateProfile(
    userId: string,
    data: Partial<UserProfile>,
  ): Promise<UserProfileDocument> {
    const profile = await this.findOrCreateProfile(userId);

    // Only allow updating certain fields
    if (data.displayName !== undefined) {
      profile.displayName = data.displayName;
    }
    if (data.bio !== undefined) {
      profile.bio = data.bio;
    }

    return profile.save();
  }
}
