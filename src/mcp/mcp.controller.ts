import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Headers,
  Query,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpService } from './mcp.service';
import { AuthService } from '../auth/auth.service';

@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly mcpService: McpService,
    private readonly authService: AuthService,
  ) {}

  private async validateApiKey(apiKey: string) {
    if (!apiKey) {
      this.logger.warn('Missing API Key');
      throw new UnauthorizedException(
        'Missing X-API-KEY header or query param',
      );
    }
    const user = await this.authService.validateApiKey(apiKey);
    if (!user) {
      this.logger.warn(`Invalid API Key: ${apiKey}`);
      throw new UnauthorizedException('Invalid API Key');
    }
    return user;
  }

  @Get('sse')
  async handleSse(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-api-key') apiKeyHeader: string,
    @Query('key') apiKeyQuery: string,
  ) {
    this.logger.log('SSE Connection Request Received');
    try {
      const apiKey = apiKeyHeader || apiKeyQuery;
      await this.validateApiKey(apiKey);

      // Fix for Antigravity EOF issue: Disable buffering and compression
      res.setHeader('X-Accel-Buffering', 'no'); // For Nginx
      res.setHeader('Cache-Control', 'no-cache, no-transform'); // Prevent compression
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*'); // Fix CORS
      // Note: Do not flushHeaders() here, as SSEServerTransport will writeHead() internally.

      await this.mcpService.handleSSE(req, res);
      this.logger.log('SSE Connection Established');
    } catch (error) {
      this.logger.error(`SSE Connection Failed: ${error.message}`);
      throw error;
    }
  }

  @Post('messages')
  async handleMessages(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-api-key') apiKeyHeader: string,
    @Query('key') apiKeyQuery: string,
  ) {
    this.logger.log(`Message Received. Query: ${JSON.stringify(req.query)}`);
    this.logger.log(`Content-Type: ${req.headers['content-type']}`);
    this.logger.log(
      `Body Is Empty? ${!req.body || Object.keys(req.body).length === 0}`,
    );
    if (req.body && Object.keys(req.body).length > 0) {
      this.logger.warn(
        `Body seems parsed! Middleware exclusion failed. Body keys: ${Object.keys(req.body)}`,
      );
    }

    try {
      const apiKey = apiKeyHeader || apiKeyQuery;
      await this.validateApiKey(apiKey);
      await this.mcpService.handleMessage(req, res);
    } catch (error) {
      this.logger.error(`Message Handling Failed: ${error.message}`);
      throw error;
    }
  }
}
