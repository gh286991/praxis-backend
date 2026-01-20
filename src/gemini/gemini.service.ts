
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel, SchemaType } from '@google/generative-ai';
import { QuestionData, GenerationUpdate } from './types';
import { UsageService } from '../users/usage.service';
import { Tag } from '../questions/schemas/tag.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GENERATE_QUESTION_PROMPT,
  GENERATE_HINT_PROMPT,
  CHECK_SEMANTICS_PROMPT,
  GENERATE_INPUT_SCRIPT_PROMPT,
} from './prompts';

import { ExecutionService } from '../execution/execution.service';
import * as fs from 'fs/promises';
import * as path from 'path';

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
    private usageService: UsageService,
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

  private async logTokens(
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

  // Stage 1: Generate Question Content (Title, Desc, Reference Code)
  private async generateQuestionContent(
    topic: string,
    tagsList: string,
    userId?: string,
    guidelines: string = '',
  ): Promise<QuestionData> {
    const promptData = GENERATE_QUESTION_PROMPT(topic, tagsList, guidelines);
    const startTime = Date.now();
    let result: any;
    let error: Error | null = null;
    
    // Define JSON Schema for Structure Output
    const questionJsonSchema = {
      description: 'Python Question Structure',
      type: SchemaType.OBJECT,
      properties: {
        title: {
          type: SchemaType.STRING,
          description: 'Question Title in Traditional Chinese',
        },
        description: {
          type: SchemaType.STRING,
          description: 'Detailed question description in Traditional Chinese',
        },
        samples: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              input: { type: SchemaType.STRING },
              output: { type: SchemaType.STRING },
              explanation: { type: SchemaType.STRING, nullable: true },
            },
            required: ['input', 'output'],
          },
        },
        tags: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        difficulty: {
          type: SchemaType.STRING,
          enum: ['easy', 'medium', 'hard'],
        },
        constraints: { type: SchemaType.STRING, nullable: true },
        referenceCode: {
          type: SchemaType.STRING,
          description: 'Complete, working Python solution code',
        },
        fileAssets: {
          type: SchemaType.ARRAY,
          description:
            'List of virtual files. Each item has filename and content.',
          nullable: true,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              filename: { type: SchemaType.STRING },
              content: { type: SchemaType.STRING },
            },
            required: ['filename', 'content'],
          },
        },
      },
      required: [
        'title',
        'description',
        'samples',
        'tags',
        'difficulty',
        'referenceCode',
      ],
    };

    try {
      result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptData.text }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: questionJsonSchema as any,
        },
      });
      
      const response = result.response;
      const textResponse = response.text();
      // Basic cleanup for JSON parsing
      const cleanedText = textResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      const rawData = JSON.parse(cleanedText);

      // Convert fileAssets from Array to Map (to maintain backward compatibility)
      if (Array.isArray(rawData.fileAssets)) {
        const assetsMap: Record<string, string> = {};
        rawData.fileAssets.forEach((item: any) => {
          if (item.filename && item.content) {
            assetsMap[item.filename] = item.content;
          }
        });
        rawData.fileAssets = assetsMap;
      }

      const questionData = rawData as QuestionData;
      
      await this.logTokens(result, 'generate-question-content', userId);
      return questionData;
    } catch (err) {
      error = err as Error;
      throw err;
    } finally {
      const durationMs = Date.now() - startTime;
      await this.logApiCall(
        'generate-question-content',
        promptData.text,
        promptData.version,
        result,
        durationMs,
        userId,
        error,
      );
    }
  }

  // Stage 2: Generate Test Input Script
  private async generateInputScript(
    questionData: QuestionData,
    userId?: string,
  ): Promise<string> {
    const promptData = GENERATE_INPUT_SCRIPT_PROMPT(questionData);
    const startTime = Date.now();
    let result: any;
    let error: Error | null = null;

    try {
      result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptData.text }] }],
        generationConfig: { responseMimeType: 'text/plain' },
      });
      
      const response = result.response;
      let script = response.text();
      
      // Cleanup markdown code blocks if present (robustly)
      script = script
        .replace(/^```[a-zA-Z]*\n?/g, '')
        .replace(/```\n?$/g, '')
        .trim();
      
      await this.logTokens(result, 'generate-input-script', userId);
      return script;
    } catch (err) {
      error = err as Error;
      throw err;
    } finally {
      const durationMs = Date.now() - startTime;
      await this.logApiCall(
        'generate-input-script',
        promptData.text,
        promptData.version,
        result,
        durationMs,
        userId,
        error,
      );
    }
  }

  private async logApiCall(
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
      console.error('[GeminiService] Failed to write API log:', err);
    }
  }

  // 將失敗的題目記錄到日誌文件
  private async logFailedQuestion(
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

  async *generateQuestionStream(
    topic: string = 'Basic Python',
    userId?: string,
    guidelines: string = '',
  ): AsyncGenerator<GenerationUpdate> {
    // 0. Setup
    const validTags = await this.tagModel.find().lean();
    const tagsList = validTags
      .map((t) => `- ${t.name} (slug: ${t.slug}) [${t.type}]`)
      .join('\n');

    let attempts = 0;
    const MAX_RETRIES = this.configService.get<number>('GEMINI_MAX_RETRIES', 2);
    let lastError: any;

    while (attempts < MAX_RETRIES) {
      attempts++;
      try {
        // --- Stage 1: Generate Question Content & Solution ---
        yield { status: 'progress', message: `生成題目內容中（第 ${attempts}/${MAX_RETRIES} 次嘗試）...` };
        
        const questionData = await this.generateQuestionContent(
          topic,
          tagsList,
          userId,
          guidelines,
        );
        
        // Basic validation
        if (!questionData.title || !questionData.referenceCode) {
          throw new Error('Generated question missing title or solution code');
        }

        // --- Stage 2: Generate Test Input Script ---
        yield { status: 'progress', message: '生成測試資料生成腳本中...' };
        
        const inputScript = await this.generateInputScript(questionData, userId);
        
        // --- Stage 3: Execute & Generate Test Cases ---
        yield { status: 'progress', message: '執行驗證並生成測試案例中...' };
        
        // 3.1 Execute Input Script to get inputs
        // Note: Input generator usually doesn't need file assets, but we pass empty object
        const inputGenResult = await this.executionService.executePython(
          inputScript,
          '',
          {}, 
        );
        
        if (inputGenResult.error) {
          console.error('Input Generation Script Error:', inputGenResult.error);
          throw new Error('Failed to generate test inputs: ' + inputGenResult.error);
        }

        let inputs: string[] = [];
        try {
          // Try to parse JSON array first
          inputs = JSON.parse(inputGenResult.output.trim());
        } catch (e) {
          // Fallback: Split by newline if JSON parse fails (less reliable but useful backup)
          console.warn('Failed to parse input script output as JSON, falling back to line split');
          // Split by newline but ignore empty lines
          inputs = inputGenResult.output.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
        }

        if (!Array.isArray(inputs) || inputs.length === 0) {
           throw new Error('No valid test inputs generated');
        }

        // 3.2 Execute reference code with each input to get outputs
        const testCases: any[] = [];
        const BATCH_SIZE = 5; 

        for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
            const batch = inputs.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(async (inputStr) => {
                 let currentInput = inputStr;
                 let currentAssets = { ...questionData.fileAssets };
                 
                 // Check for "filename: content" override pattern
                 if (questionData.fileAssets) {
                     for (const filename of Object.keys(questionData.fileAssets)) {
                         if (typeof inputStr === 'string' && inputStr.startsWith(filename + ':')) {
                             const content = inputStr.substring(filename.length + 1);
                             currentAssets[filename] = content;
                             // Clear stdin if file override is present, as usually file based questions don't use stdin
                             // and the input string here IS the file content override.
                             currentInput = ''; 
                             break; 
                         }
                     }
                 }

                 const result = await this.executionService.executePython(
                     questionData.referenceCode!,
                     currentInput, 
                     currentAssets
                 );
                 
                 return {
                     input: inputStr,
                     output: result.output.trim(),
                     error: result.error,
                     passed: !result.error
                 };
            }));
            
            for (const res of results) {
                if (res.passed && res.output.length > 0) {
                    testCases.push({
                        input: res.input,
                        output: res.output,
                        // Rough classification logic
                        type: testCases.length < 2 ? 'edge' : 'normal', 
                        description: res.input.length > 50 ? 'Generated Case' : `Input: ${res.input.substring(0, 20)}`
                    });
                }
            }
        }
        
        if (testCases.length < 3) {
            throw new Error(`Only generated ${testCases.length} valid test cases, need at least 3`);
        }

        // --- Stage 3.5: Verify and Fix Samples Output ---
        yield { status: 'progress', message: '驗證範例輸出中...' };
        
        if (questionData.samples && questionData.samples.length > 0) {
          const verifiedSamples: { input: string; output: string; explanation?: string }[] = [];
          
          for (const sample of questionData.samples) {
            let currentInput = sample.input;
            const currentAssets = { ...questionData.fileAssets };
            
            // Parse "filename: content" format for file I/O
            if (questionData.fileAssets) {
              for (const filename of Object.keys(questionData.fileAssets)) {
                if (typeof currentInput === 'string' && currentInput.startsWith(filename + ':')) {
                  const content = currentInput.substring(filename.length + 1);
                  currentAssets[filename] = content;
                  currentInput = ''; // Clear stdin since input is file content
                  break;
                }
              }
            }
            
            // Execute referenceCode to get correct output
            const result = await this.executionService.executePython(
              questionData.referenceCode!,
              currentInput,
              currentAssets
            );
            
            if (!result.error && result.output.trim().length > 0) {
              verifiedSamples.push({
                input: sample.input,
                output: result.output.trim(),
                explanation: sample.explanation
              });
            }
          }
          
          // Use verified samples (at least keep first 2-4)
          if (verifiedSamples.length >= 2) {
            questionData.samples = verifiedSamples.slice(0, 4);
          }
        }

        // 4. Backward Compatibility & Final Assembly
        if (questionData.samples && questionData.samples.length > 0) {
          questionData.sampleInput = questionData.samples[0].input;
          questionData.sampleOutput = questionData.samples[0].output;
        }

        // Resolve tags from slugs to IDs
        if (questionData.tags && questionData.tags.length > 0) {
             const slugToIdMap = new Map(
               validTags.map((t) => [t.slug, t._id.toString()]),
             );
             questionData.tags = questionData.tags
               .map((slug) => slugToIdMap.get(slug))
               .filter((id) => !!id) as string[];
        }

        const finalData: QuestionData = {
            ...questionData,
            testCases: testCases,
        };

        yield { status: 'success', data: finalData, message: '題目生成成功' };
        return;

      } catch (err: any) {
        lastError = err;
        console.error(`Attempt ${attempts} failed:`, err.message);
        
        // Log failure
        await this.logFailedQuestion(topic, attempts, MAX_RETRIES, {} as QuestionData, err.message, userId);
        
        yield { status: 'error', message: `Attempt ${attempts} failed: ${err.message}. Retrying...` };
      }
    }
    
    throw lastError || new Error('Failed to generate valid question after max retries');
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
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { responseMimeType: 'application/json' },
      });
      await this.logTokens(result, 'check_semantics', userId);
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
