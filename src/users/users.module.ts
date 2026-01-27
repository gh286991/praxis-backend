import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsageController } from './usage.controller';
import { User, UserSchema } from './schemas/user.schema';
import { UserProfile, UserProfileSchema } from './schemas/user-profile.schema';
import { UsageLog, UsageLogSchema } from './schemas/usage-log.schema';
import { UsageService } from './usage.service';
import {
  UserProgress,
  UserProgressSchema,
} from '../questions/schemas/user-progress.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UserProfile.name, schema: UserProfileSchema },
      { name: UsageLog.name, schema: UsageLogSchema },
      { name: UserProgress.name, schema: UserProgressSchema },
    ]),
  ],
  controllers: [UsersController, UsageController],
  providers: [UsersService, UsageService],
  exports: [UsersService, UsageService],
})
export class UsersModule {}
