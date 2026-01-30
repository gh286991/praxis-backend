import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { McpService } from './mcp/mcp.service';
import { ConsoleLogger } from '@nestjs/common';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Explicitly load .env from the backend root (dist/../.env)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// CRITICAL: Redirect all console.log to stderr immediately to protect stdout for JSON-RPC
const originalConsoleLog = console.log;
console.log = console.error;

// Custom Logger that writes EVERYTHING to stderr
// This is critical because stdout is reserved for MCP JSON-RPC messages
class StderrLogger extends ConsoleLogger {
  log(message: any, ...optionalParams: any[]) {
    console.error(message, ...optionalParams);
  }
  error(message: any, ...optionalParams: any[]) {
    console.error(message, ...optionalParams);
  }
  warn(message: any, ...optionalParams: any[]) {
    console.error(message, ...optionalParams);
  }
  debug(message: any, ...optionalParams: any[]) {
    console.error(message, ...optionalParams);
  }
  verbose(message: any, ...optionalParams: any[]) {
    console.error(message, ...optionalParams);
  }
}

async function bootstrap() {
  // Create ApplicationContext (No HTTP Server)
  // Disable default logger during creation to prevent startup noise on stdout
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new StderrLogger(), // Use our stderr-only logger
  });

  const mcpService = app.get(McpService);
  
  await mcpService.startStdio();
  
  // Keep the process alive
}

bootstrap();
