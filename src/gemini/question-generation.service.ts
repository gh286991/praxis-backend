import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerativeModel, SchemaType } from '@google/generative-ai';
import { QuestionData, GenerationUpdate } from './types';
import { Tag } from '../questions/schemas/tag.schema';
import { Question } from '../questions/schemas/question.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GENERATE_QUESTION_PROMPT,
  GENERATE_INPUT_SCRIPT_PROMPT,
} from './prompts';
import { ExecutionService } from '../execution/execution.service';
import { GeminiLogService } from './gemini-log.service';

@Injectable()
export class QuestionGenerationService {
  constructor(
    private configService: ConfigService,
    private executionService: ExecutionService,
    private geminiLog: GeminiLogService,
    @InjectModel(Tag.name) private tagModel: Model<Tag>,
    @InjectModel(Question.name) private questionModel: Model<Question>,
  ) {}

  async *generateQuestionStream(
    model: GenerativeModel,
    topic: string = 'Basic Python',
    userId?: string,
    guidelines: string = '',
    categorySlug?: string,
  ): AsyncGenerator<GenerationUpdate> {
    // 0. Setup
    const validTags = await this.tagModel.find().lean();
    const tagsList = validTags
      .map((t) => `- ${t.name} (slug: ${t.slug}) [${t.type}]`)
      .join('\n');

    // Fetch recent 10 question titles from same category to avoid repetition
    const recentQuestions = categorySlug
      ? await this.questionModel
          .find({ category: categorySlug })
          .sort({ createdAt: -1 })
          .limit(10)
          .select('title')
          .lean()
      : [];
    const recentTitles = recentQuestions.map((q) => q.title).join('\n- ');
    const diversityHint = recentTitles
      ? `\n\nIMPORTANT - AVOID REPETITION:\nThe following questions have already been generated. Please create something DIFFERENT:\n- ${recentTitles}\n`
      : '';

    let attempts = 0;
    const MAX_RETRIES = this.configService.get<number>('GEMINI_MAX_RETRIES', 2);
    let lastError: any;

    while (attempts < MAX_RETRIES) {
      attempts++;
      try {
        // --- Stage 1: Generate Question Content & Solution ---
        yield {
          status: 'progress',
          message: `生成題目內容中（第 ${attempts}/${MAX_RETRIES} 次嘗試）...`,
        };

        const questionData = await this.generateQuestionContent(
          model,
          topic,
          tagsList,
          userId,
          guidelines + diversityHint,
        );

        // Basic validation
        if (!questionData.title || !questionData.referenceCode) {
          throw new Error('Generated question missing title or solution code');
        }

        // --- Stage 2: Generate Test Input Script ---
        yield { status: 'progress', message: '生成測試資料生成腳本中...' };

        const inputScript = await this.generateInputScript(
          model,
          questionData,
          userId,
        );

        // --- Stage 3: Execute & Generate Test Cases ---
        yield { status: 'progress', message: '執行驗證並生成測試案例中...' };

        // 3.1 Execute Input Script to get inputs
        const inputGenResult =
          await this.executionService.executePythonForGeneration(
            inputScript,
            '',
            {},
          );

        if (inputGenResult.error) {
          console.error('Input Generation Script Error:', inputGenResult.error);
          throw new Error(
            'Failed to generate test inputs: ' + inputGenResult.error,
          );
        }

        let inputs: string[] = [];
        try {
          // Try to parse JSON array first
          inputs = JSON.parse(inputGenResult.output.trim());
        } catch (e) {
          console.warn(
            'Failed to parse input script output as JSON, falling back to line split',
          );
          inputs = inputGenResult.output
            .trim()
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0);
        }

        if (!Array.isArray(inputs) || inputs.length === 0) {
          throw new Error('No valid test inputs generated');
        }

        // 3.2 Execute reference code with each input to get outputs
        const testCases: any[] = [];
        const BATCH_SIZE = 5;

        for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
          const batch = inputs.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(
            batch.map(async (inputStr) => {
              let currentInput = inputStr;
              const currentAssets = { ...questionData.fileAssets };

              // Check for "filename: content" override pattern
              if (questionData.fileAssets) {
                for (const filename of Object.keys(questionData.fileAssets)) {
                  if (
                    typeof inputStr === 'string' &&
                    inputStr.startsWith(filename + ':')
                  ) {
                    const content = inputStr.substring(filename.length + 1);
                    currentAssets[filename] = content;
                    currentInput = '';
                    break;
                  }
                }
              }

              const result = await this.executionService.executePython(
                questionData.referenceCode!,
                currentInput,
                currentAssets,
              );

              return {
                input: inputStr,
                output: result.output.trim(),
                error: result.error,
                passed: !result.error,
              };
            }),
          );

          for (const res of results) {
            if (res.passed && res.output.length > 0) {
              testCases.push({
                input: res.input,
                output: res.output,
                // Rough classification logic
                type: testCases.length < 2 ? 'edge' : 'normal',
                description:
                  res.input.length > 50
                    ? 'Generated Case'
                    : `Input: ${res.input.substring(0, 20)}`,
              });
            }
          }
        }

        if (testCases.length < 3) {
          throw new Error(
            `Only generated ${testCases.length} valid test cases, need at least 3`,
          );
        }

        // --- Stage 3.5: Verify and Fix Samples Output ---
        yield { status: 'progress', message: '驗證範例輸出中...' };

        if (questionData.samples && questionData.samples.length > 0) {
          const verifiedSamples: {
            input: string;
            output: string;
            explanation?: string;
          }[] = [];

          for (const sample of questionData.samples) {
            let currentInput = sample.input;
            const currentAssets = { ...questionData.fileAssets };

            // Parse "filename: content" format for file I/O
            if (questionData.fileAssets) {
              for (const filename of Object.keys(questionData.fileAssets)) {
                if (
                  typeof currentInput === 'string' &&
                  currentInput.startsWith(filename + ':')
                ) {
                  const content = currentInput.substring(filename.length + 1);
                  currentAssets[filename] = content;
                  currentInput = '';
                  break;
                }
              }
            }

            // Execute referenceCode to get correct output
            const result = await this.executionService.executePython(
              questionData.referenceCode,
              currentInput,
              currentAssets,
            );

            if (!result.error && result.output.trim().length > 0) {
              verifiedSamples.push({
                input: sample.input,
                output: result.output.trim(),
                explanation: sample.explanation,
              });
            }
          }

          // Use verified samples
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

        // Log failure - now using GeminiLogService
        await this.geminiLog.logFailedQuestion(
          topic,
          attempts,
          MAX_RETRIES,
          {} as QuestionData,
          err.message,
          userId,
        );

        yield {
          status: 'error',
          message: `Attempt ${attempts} failed: ${err.message}. Retrying...`,
        };
      }
    }

    throw (
      lastError ||
      new Error('Failed to generate valid question after max retries')
    );
  }

  private async generateQuestionContent(
    model: GenerativeModel,
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
      // Use higher temperature for more creative/diverse questions
      const temperature = this.configService.get<number>(
        'GEMINI_TEMPERATURE',
        1.0,
      );

      result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptData.text }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: questionJsonSchema as any,
          temperature: temperature,
        },
      });

      const response = result.response;
      const textResponse = response.text();
      // Basic cleanup for JSON parsing
      const cleanedText = textResponse
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/, '');
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

      await this.geminiLog.logTokens(
        result,
        'generate-question-content',
        userId,
      );
      return questionData;
    } catch (err) {
      error = err as Error;
      throw err;
    } finally {
      const durationMs = Date.now() - startTime;
      await this.geminiLog.logApiCall(
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

  private async generateInputScript(
    model: GenerativeModel,
    questionData: QuestionData,
    userId?: string,
  ): Promise<string> {
    const promptData = GENERATE_INPUT_SCRIPT_PROMPT(questionData);
    const startTime = Date.now();
    let result: any;
    let error: Error | null = null;

    try {
      result = await model.generateContent({
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

      await this.geminiLog.logTokens(result, 'generate-input-script', userId);
      return script;
    } catch (err) {
      error = err as Error;
      throw err;
    } finally {
      const durationMs = Date.now() - startTime;
      await this.geminiLog.logApiCall(
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
}
