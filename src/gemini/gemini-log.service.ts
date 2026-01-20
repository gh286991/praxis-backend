
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsageService } from '../users/usage.service';
import { QuestionData } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class GeminiLogService {
  constructor(
    private configService: ConfigService,
    private usageService: UsageService,
  ) {}

  async logTokens(
    result: any,
    endpoint: string,
    userId: string = 'system',
  ) {
    if (result.response.usageMetadata) {
      const { promptTokenCount, candidatesTokenCount } =
        result.response.usageMetadata;
      const modelName =
        this.configService.get<string>('GEMINI_MODEL') ||
        'gemini-2.5-flash-lite';
      await this.usageService.logUsage(
        userId,
        modelName,
        endpoint,
        promptTokenCount,
        candidatesTokenCount,
      );
    }
  }

  async logApiCall(
    endpoint: string,
    promptText: string,
    promptVersion: string,
    result: any,
    durationMs: number,
    userId: string = 'unknown',
    error: Error | null = null,
  ) {
    if (this.configService.get<string>('GEMINI_LOG_ENABLED') !== 'true') return;

    const logPath =
      this.configService.get<string>('GEMINI_LOG_PATH') ||
      path.join(process.cwd(), 'logs', 'gemini-api-calls.log');
    const modelName =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash-lite';

    const logEntry = {
      timestamp: new Date().toISOString(),
      endpoint,
      modelName,
      userId,
      request: {
        promptVersion,
        promptText:
          promptText.substring(0, 1000) +
          (promptText.length > 1000 ? '...' : ''),
      },
      response: error
        ? null
        : {
            text: result.response.text
              ? result.response.text().substring(0, 2000)
              : null,
            usageMetadata: result.response.usageMetadata || null,
          },
      durationMs,
      success: !error,
      error: error ? error.message : null,
    };

    try {
      const logDir = path.dirname(logPath);
      await fs.mkdir(logDir, { recursive: true });

      // Format with indentation for readability and add separator
      const formattedEntry = JSON.stringify(logEntry, null, 2);
      const separator = '\n' + '='.repeat(80) + '\n';

      await fs.appendFile(logPath, formattedEntry + separator);
    } catch (err) {
      console.error('[GeminiLogService] Failed to write API log:', err);
    }
  }

  async logFailedQuestion(
    topic: string,
    attempt: number,
    maxRetries: number,
    questionData: QuestionData,
    errorMsg: string,
    userId?: string,
  ) {
    try {
      const logsDir = path.join(process.cwd(), 'logs');
      await fs.mkdir(logsDir, { recursive: true });

      const logFilePath = path.join(logsDir, 'failed-questions.log');
      const timestamp = new Date().toISOString();

      const logEntry = [
        '\n' + '='.repeat(80),
        `時間: ${timestamp}`,
        `嘗試次數: ${attempt + 1}/${maxRetries}`,
        `主題: ${topic}`,
        `用戶ID: ${userId || 'N/A'}`,
        `錯誤訊息: ${errorMsg}`,
        '',
        '--- 生成的題目數據 ---',
        JSON.stringify(questionData, null, 2),
        '',
        '--- 參考答案程式碼 ---',
        questionData.referenceCode || '(無參考答案)',
        '='.repeat(80),
        '',
      ];

      await fs.appendFile(logFilePath, logEntry.join('\n'));
      console.log(`[日誌] 失敗題目已記錄到: ${logFilePath}`);
    } catch (err) {
      console.error('[日誌] 無法寫入失敗題目日誌:', err);
    }
  }
}
