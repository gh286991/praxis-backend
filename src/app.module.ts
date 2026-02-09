import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GeminiModule } from './gemini/gemini.module';
import { QuestionsModule } from './questions/questions.module';
import { ExecutionModule } from './execution/execution.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { McpModule } from './mcp/mcp.module';
import { ImportModule } from './import/import.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { json, urlencoded } from 'express';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    GeminiModule,
    QuestionsModule,
    ExecutionModule,
    UsersModule,
    AuthModule,
    ImportModule,
    McpModule, // Imported
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get('THROTTLE_TTL', 60000)),
          limit: Number(config.get('THROTTLE_LIMIT', 100)),
        },
      ],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // We need to disable body parsing for MCP messages endpoint so SDK can handle the stream
    consumer
      .apply(json(), urlencoded({ extended: true }))
      .exclude(
        { path: 'mcp/messages', method: RequestMethod.POST },
        { path: 'api/mcp/messages', method: RequestMethod.POST },
      )
      .forRoutes('(.*)');
  }
}
