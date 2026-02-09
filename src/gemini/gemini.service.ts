import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  GenerativeModel,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';

import { QuestionData, GenerationUpdate } from './types';
import { Tag } from '../questions/schemas/tag.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GENERATE_LOGIC_HINT_PROMPT,
  GENERATE_CODE_HINT_PROMPT,
  CHECK_SEMANTICS_PROMPT,
  CHAT_WITH_TUTOR_PROMPT,
} from './prompts';

import { ExecutionService } from '../execution/execution.service';
import { GeminiLogService } from './gemini-log.service';
import { QuestionGenerationService } from './question-generation.service';

// Fix for fetch API in Node environment for Gemini SDK
if (!global.fetch) {
  global.fetch = require('node-fetch');
  global.Headers = require('node-fetch').Headers;
  global.Request = require('node-fetch').Request;
  global.Response = require('node-fetch').Response;
}

@Injectable()
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(
    private configService: ConfigService,
    private geminiLog: GeminiLogService,
    private questionGenService: QuestionGenerationService,
    @InjectModel(Tag.name) private tagModel: Model<Tag>,
    private executionService: ExecutionService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);

    const provider = this.configService.get<string>('AI_PROVIDER') || 'google';
    const modelName =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash-lite';

    console.log(
      `[GeminiService] Initializing with Provider: ${provider}, Model: ${modelName}`,
    );

    const requestOptions: any = {};
    if (provider === 'zeabur') {
      requestOptions.baseUrl = 'https://hnd1.aihub.zeabur.ai/gemini';
      console.log(
        `[GeminiService] set baseUrl to Zeabur Proxy: ${requestOptions.baseUrl}`,
      );
    }

    this.model = this.genAI.getGenerativeModel(
      {
        model: modelName,
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      },
      requestOptions,
    );
  }

  async generateQuestion(
    topic: string = 'Basic Python',
    userId?: string,
    guidelines: string = '',
  ): Promise<QuestionData> {
    const stream = this.generateQuestionStream(topic, userId, guidelines);
    let finalResult: QuestionData | undefined;

    for await (const update of stream) {
      if (update.status === 'success' && update.data) {
        finalResult = update.data;
      } else if (update.status === 'error') {
        throw new Error(update.message);
      }
    }

    if (!finalResult) {
      throw new Error('Failed to generate question (no result returned)');
    }
    return finalResult;
  }

  // Delegate to QuestionGenerationService
  async *generateQuestionStream(
    topic: string = 'Basic Python',
    userId?: string,
    guidelines: string = '',
    categorySlug?: string,
  ): AsyncGenerator<GenerationUpdate> {
    yield* this.questionGenService.generateQuestionStream(
      this.model,
      topic,
      userId,
      guidelines,
      categorySlug,
    );
  }

  private async generateWithRetry(
    operationName: string,
    operation: () => Promise<any>,
  ): Promise<any> {
    const maxRetries = parseInt(
      this.configService.get<string>('GEMINI_MAX_RETRIES') || '2',
      10,
    );
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const status =
          error.status || (error.response ? error.response.status : 'unknown');

        console.warn(
          `[GeminiService] ${operationName} failed (Attempt ${attempt}/${maxRetries + 1}). Status: ${status}`,
          error.message || error,
        );

        if (status === 429) {
          // If 429, wait with exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          console.log(
            `[GeminiService] Rate limited (429). Waiting ${delay}ms before retry...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // For other errors, maybe we shouldn't retry?
        // For now, let's retry on all errors as the previous logic wasn't specific.
        // But usually only 429/503 are retryable.
        if (attempt < maxRetries + 1) {
          const delay = 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // Log detailed error before giving up
    console.error(
      `[GeminiService] ${operationName} failed after ${maxRetries + 1} attempts.`,
      JSON.stringify(lastError, null, 2),
    );
    throw lastError;
  }

  async generateHint(
    question: QuestionData,
    userCode: string,
    userId?: string,
    hintType: 'logic' | 'code' = 'code',
  ): Promise<string> {
    const promptGenerator =
      hintType === 'logic'
        ? GENERATE_LOGIC_HINT_PROMPT
        : GENERATE_CODE_HINT_PROMPT;

    const { text, version } = promptGenerator(question, userCode);

    try {
      const result = await this.generateWithRetry(
        `generateHint(${hintType})`,
        () => this.model.generateContent(text),
      );

      await this.geminiLog.logTokens(
        result,
        hintType === 'logic' ? 'generate_hint_logic' : 'generate_hint_code',
        userId,
      );
      console.log(`Generated Hint (${hintType}) using Prompt v${version}`);

      return result.response.text();
    } catch (error) {
      // already logged in generateWithRetry
      return '無法產生提示，請再試一次。';
    }
  }

  async checkSemantics(
    question: QuestionData,
    userCode: string,
    userId?: string,
  ): Promise<{ passed: boolean; feedback: string }> {
    const { text, version } = CHECK_SEMANTICS_PROMPT(question, userCode);

    try {
      const result = await this.generateWithRetry('checkSemantics', () =>
        this.model.generateContent({
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      );

      await this.geminiLog.logTokens(result, 'check_semantics', userId);
      console.log(`Checked Semantics using Prompt v${version}`);

      const textResponse = result.response.text();
      // Advanced cleanup: Find the first '{' and last '}'
      const firstBrace = textResponse.indexOf('{');
      const lastBrace = textResponse.lastIndexOf('}');
      let cleanedText = textResponse;

      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanedText = textResponse.substring(firstBrace, lastBrace + 1);
      }

      cleanedText = cleanedText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      return JSON.parse(cleanedText);
    } catch (error) {
      // already logged
      return { passed: true, feedback: '無法進行語意分析 (AI Error)' };
    }
  }

  async chatWithTutor(
    question: QuestionData,
    userCode: string,
    chatHistory: { role: 'user' | 'model'; message: string }[],
    userMessage: string,
    userId?: string,
  ): Promise<string> {
    // Limit history to last 20 messages to save tokens
    const recentHistory = chatHistory.slice(-20);

    const { text, version } = CHAT_WITH_TUTOR_PROMPT(
      question,
      userCode,
      recentHistory,
      userMessage,
    );

    try {
      const result = await this.generateWithRetry('chatWithTutor', () =>
        this.model.generateContent(text),
      );

      await this.geminiLog.logTokens(result, 'chat_with_tutor', userId);
      console.log(`Chat with Tutor using Prompt v${version}`);

      return result.response.text();
    } catch (error) {
      // already logged
      return 'AI 導師暫時無法回應，請稍後再試。';
    }
  }
}
