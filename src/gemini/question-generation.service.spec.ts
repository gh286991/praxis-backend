
import { Test, TestingModule } from '@nestjs/testing';
import { QuestionGenerationService } from './question-generation.service';
import { ConfigService } from '@nestjs/config';
import { ExecutionService } from '../execution/execution.service';
import { GeminiLogService } from './gemini-log.service';
import { getModelToken } from '@nestjs/mongoose';
import { Tag } from '../questions/schemas/tag.schema';
import { GenerativeModel } from '@google/generative-ai';

// Mock GeminiLogService
const mockGeminiLogService = {
  logTokens: jest.fn(),
  logApiCall: jest.fn(),
  logFailedQuestion: jest.fn(),
};

// Mock GoogleGenerativeAI Model
const mockGenerateContent = jest.fn();
const mockModel = {
  generateContent: mockGenerateContent,
} as unknown as GenerativeModel;

describe('QuestionGenerationService', () => {
  let service: QuestionGenerationService;
  let executionService: ExecutionService;

  beforeEach(async () => {
    mockGenerateContent.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionGenerationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'GEMINI_MAX_RETRIES') return 2;
              return null;
            }),
          },
        },
        {
          provide: ExecutionService,
          useValue: {
            executePython: jest.fn(),
          },
        },
        {
          provide: GeminiLogService,
          useValue: mockGeminiLogService,
        },
        {
          provide: getModelToken(Tag.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                { name: 'Tag1', slug: 'tag1', type: 'concept', _id: 'id1' },
              ]),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<QuestionGenerationService>(QuestionGenerationService);
    executionService = module.get<ExecutionService>(ExecutionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateQuestionStream', () => {
    it('should generate a question successfully', async () => {
      // Mock AI Responses
      // Stage 1: Question Content
      const mockQuestionContent = {
        title: 'Test Question',
        description: 'Desc',
        samples: [{ input: '1', output: '1' }],
        tags: ['tag1'],
        difficulty: 'easy',
        referenceCode: 'print(input())',
        fileAssets: [{ filename: 'test.txt', content: 'hello' }],
      };
      
      // Stage 2: Input Script
      const mockInputScript = 'print(["1", "2", "3"])';

      mockGenerateContent
        .mockResolvedValueOnce({ // Stage 1 Response
          response: {
            text: () => JSON.stringify(mockQuestionContent),
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
          },
        })
        .mockResolvedValueOnce({ // Stage 2 Response
          response: {
            text: () => mockInputScript,
            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
          },
        });

      // Mock Execution Service
      // 3.1 Input Generation
      jest.spyOn(executionService, 'executePython')
        .mockResolvedValueOnce({ output: '["1", "2", "3"]', error: '' } as any) // Input Gen
        // 3.2 Reference Code Execution (3 inputs)
        .mockResolvedValueOnce({ output: '1', error: '' } as any)
        .mockResolvedValueOnce({ output: '2', error: '' } as any)
        .mockResolvedValueOnce({ output: '3', error: '' } as any)
        // 3.5 Sample Verification (1 sample)
        .mockResolvedValueOnce({ output: '1', error: '' } as any);

      const generator = service.generateQuestionStream(mockModel, 'Test Topic', 'user1');
      let finalResult: any;
      
      for await (const update of generator) {
          if (update.status === 'success') {
              finalResult = update.data;
          }
      }

      expect(finalResult).toBeDefined();
      expect(finalResult.title).toBe('Test Question');
      // Verify fileAssets conversion
      expect(finalResult.fileAssets).toEqual({ 'test.txt': 'hello' });
      expect(finalResult.testCases).toHaveLength(3);
    }, 30000);
  });
});
