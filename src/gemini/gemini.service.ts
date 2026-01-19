import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { UsageService } from '../users/usage.service';
import { QuestionData } from './types';
import { 
  GENERATE_QUESTION_PROMPT, 
  GENERATE_HINT_PROMPT, 
  CHECK_SEMANTICS_PROMPT 
} from './prompts';

@Injectable()
export class GeminiService {
  private model: GenerativeModel;

  constructor(
    private configService: ConfigService,
    private usageService: UsageService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  }

  private async logTokens(
    result: any,
    endpoint: string,
    userId: string = 'system',
  ) {
    if (result.response.usageMetadata) {
      const { promptTokenCount, candidatesTokenCount } =
        result.response.usageMetadata;
      await this.usageService.logUsage(
        userId,
        'gemini-2.5-flash-lite',
        endpoint,
        promptTokenCount,
        candidatesTokenCount,
      );
    }
  }

  async generateQuestion(
    topic: string = 'Basic Python',
    userId?: string,
  ): Promise<QuestionData> {
    const { text, version } = GENERATE_QUESTION_PROMPT(topic);

    try {
      const result = await this.model.generateContent(text);
      const response = result.response;
      const textResponse = response.text();
      
      // Basic cleanup to ensure JSON parsing works if model wraps it in md code blocks
      const cleanedText = textResponse
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      await this.logTokens(result, 'generate_question', userId);
      console.log(`Generated Question using Prompt v${version}`);

      const parsedData = JSON.parse(cleanedText) as QuestionData;

      // Ensure backward compatibility: set sampleInput/sampleOutput from samples[0]
      if (parsedData.samples && parsedData.samples.length > 0) {
        parsedData.sampleInput = parsedData.samples[0].input;
        parsedData.sampleOutput = parsedData.samples[0].output;
      }

      // Log generation summary
      console.log(
        `Generated: ${parsedData.title} | ` +
        `Difficulty: ${parsedData.difficulty} | ` +
        `Samples: ${parsedData.samples?.length || 0} | ` +
        `Tests: ${parsedData.testCases?.length || 0} | ` +
        `Tags: ${parsedData.tags?.join(', ') || 'none'}`,
      );

      return parsedData;
    } catch (error) {
      console.error('Error generating question:', error);
      throw error;
    }
  }

  async generateHint(
    question: QuestionData,
    userCode: string,
    userId?: string,
  ): Promise<string> {
    const { text, version } = GENERATE_HINT_PROMPT(question, userCode);

    try {
      const result = await this.model.generateContent(text);
      await this.logTokens(result, 'generate_hint', userId);
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
      const result = await this.model.generateContent(text);
      await this.logTokens(result, 'check_semantics', userId);
      console.log(`Checked Semantics using Prompt v${version}`);

      const textResponse = result.response.text();
      const cleanedText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanedText);
    } catch (error) {
      console.error('Error checking semantics:', error);
      // Fail open or closed? Let's fail open but warn.
      return { passed: true, feedback: '無法進行語意分析 (AI Error)' };
    }
  }
}
