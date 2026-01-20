import { Test, TestingModule } from '@nestjs/testing';
import { GeminiService } from './gemini.service';
import { ConfigService } from '@nestjs/config';
import { ExecutionService } from '../execution/execution.service';
import { getModelToken } from '@nestjs/mongoose';
import { Tag } from '../questions/schemas/tag.schema';
import { GeminiLogService } from './gemini-log.service';
import { QuestionGenerationService } from './question-generation.service';

// Mock fs/promises
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  appendFile: jest.fn().mockResolvedValue(undefined),
}));

// Mock GoogleGenerativeAI
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({}),
    })),
  };
});

describe('GeminiService', () => {
  let service: GeminiService;
  let qGenService: QuestionGenerationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'GEMINI_API_KEY') return 'test-api-key';
              if (key === 'GEMINI_MODEL') return 'gemini-test';
              return null;
            }),
          },
        },
        // Mock GeminiLogService
        {
          provide: GeminiLogService,
          useValue: {
            logTokens: jest.fn(),
          },
        },
        // Mock QuestionGenerationService
        {
          provide: QuestionGenerationService,
          useValue: {
            generateQuestionStream: jest.fn(async function* () {
              yield { status: 'success', data: { title: 'MockQ' } };
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
          provide: getModelToken(Tag.name),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<GeminiService>(GeminiService);
    qGenService = module.get<QuestionGenerationService>(
      QuestionGenerationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateQuestion', () => {
    it('should delegate to QuestionGenerationService', async () => {
      const result = await service.generateQuestion('topic');
      expect(result.title).toBe('MockQ');
      expect(qGenService.generateQuestionStream).toHaveBeenCalled();
    });
  });
});
