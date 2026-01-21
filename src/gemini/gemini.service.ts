import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { QuestionData, GenerationUpdate } from './types';
import { Tag } from '../questions/schemas/tag.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GENERATE_HINT_PROMPT, CHECK_SEMANTICS_PROMPT } from './prompts';

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

    const modelName =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash-lite';
    console.log(`[GeminiService] Using model: ${modelName}`);
    this.model = this.genAI.getGenerativeModel({ model: modelName });
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

  async generateHint(
    question: QuestionData,
    userCode: string,
    userId?: string,
  ): Promise<string> {
    const { text, version } = GENERATE_HINT_PROMPT(question, userCode);

    try {
      const result = await this.model.generateContent(text);
      await this.geminiLog.logTokens(result, 'generate_hint', userId);
      console.log(`Generated Hint using Prompt v${version}`);

      return result.response.text();
    } catch (error) {
      console.error('Error generating hint:', error);
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
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { responseMimeType: 'application/json' },
      });
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
      console.error('Error checking semantics:', error);
      // Fail open or closed? Let's fail open but warn.
      return { passed: true, feedback: '無法進行語意分析 (AI Error)' };
    }
  }
}
