import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsageLog, UsageLogSchema } from './schemas/usage-log.schema';
import { UsageService } from './usage.service';
import { UserProfile, UserProfileSchema } from './schemas/user-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UsageLog.name, schema: UsageLogSchema },
      { name: UserProfile.name, schema: UserProfileSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, UsageService],
  exports: [UsersService, UsageService],
})
export class UsersModule {}
