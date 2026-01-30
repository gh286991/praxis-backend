import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { QuestionsModule } from '../questions/questions.module';
import { ImportModule } from '../import/import.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [QuestionsModule, ImportModule, AuthModule, ConfigModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
