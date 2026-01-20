import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  UseGuards,
  Query,
  Inject,
  forwardRef,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { QuestionsService } from './questions.service';
import { MigrationService } from './migration.service';
import { CategoriesService } from './categories.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GeminiService } from '../gemini/gemini.service';
import { QuestionData } from '../gemini/types';

@Controller('questions')
export class QuestionsController {
  constructor(
    private readonly questionsService: QuestionsService,
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    private readonly migrationService: MigrationService,
    private readonly categoriesService: CategoriesService,
  ) {}

  @Post('migration/init')
  async initMigration() {
    await this.migrationService.initializePythonBasic();
    await this.migrationService.createOtherSubjects();
    return { success: true, message: 'Initialization completed' };
  }

  @Post('migration/init-tags')
  async initTags() {
    const result = await this.migrationService.initializeTags();
    return { success: true, ...result };
  }

  @Post()
  create(@Body() createQuestionDto: CreateQuestionDto) {
    return this.questionsService.create(createQuestionDto);
  }

  @Get()
  findAll() {
    return this.questionsService.findAll();
  }

  // SSE route must come BEFORE :id route to avoid path conflicts
  @UseGuards(JwtAuthGuard)
  @Sse('stream')
  streamNextQuestion(
    @Query('category') category: string,
    @Query('force') forceStr: string,
    @Request() req: any,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const process = async () => {
        try {
          // Debug logging
          console.log(
            '[SSE] Request headers:',
            req.headers?.authorization ? 'Token present' : 'No token',
          );
          console.log('[SSE] Category:', category);
          console.log('[SSE] Force:', forceStr);
          console.log('[SSE] User:', req.user);

          const userId = req.user?.sub; // JWT Strategy returns user.sub as userId
          console.log('[SSE] UserID:', userId);
          const force = forceStr === 'true';

          subscriber.next({
            data: { status: 'progress', message: '檢查學習歷史紀錄...' },
          } as MessageEvent);

          // 1. Try to find existing question
          const question = force
            ? null
            : await this.questionsService.getNextQuestion(
                userId,
                category,
                false,
              );

          if (question) {
            subscriber.next({
              data: {
                status: 'success',
                message: '找到現有題目',
                data: question,
              },
            } as MessageEvent);
            subscriber.complete();
            return;
          }

          // 2. Generate new question
          subscriber.next({
            data: { status: 'progress', message: '正在生成專屬 AI 題目...' },
          } as MessageEvent);

          // Get category info from DB for better AI topic context
          const categoryInfo =
            await this.categoriesService.findBySlugOnly(category);
          const topic = categoryInfo
            ? `${categoryInfo.name}${categoryInfo.description ? ` - ${categoryInfo.description}` : ''}`
            : `Python ${category}`;
          console.log(`[SSE] Generating question for topic: ${topic}`);

          const stream = this.geminiService.generateQuestionStream(
            topic,
            userId,
            categoryInfo?.guidelines || '',
          );

          for await (const update of stream) {
            if (update.status === 'success' && update.data) {
              subscriber.next({
                data: {
                  status: 'progress',
                  message: '驗證通過，正在儲存題目...',
                },
              } as MessageEvent);

              // Save to DB
              // Save to DB
              const questionToSave = {
                ...update.data,
                category,
                subjectId: null,
                categoryId: null,
                generatedBy: userId,
                generatedAt: new Date(),
                isAIGenerated: true,
              };

              if (update.data.testCases && update.data.testCases.length > 0) {
                console.log(
                  `[SSE] Saving generated question with ${update.data.testCases.length} test cases.`,
                );
              } else {
                console.warn(
                  `[SSE] WARNING: Saving generated question with NO test cases!`,
                );
              }

              const savedQuestion = await this.questionsService.create(
                questionToSave as any,
              );

              await this.questionsService.recordQuestionGeneration(
                userId,
                savedQuestion._id.toString(),
                category,
              );

              // Get fully populated question
              const finalQuestion = await this.questionsService.findOne(
                savedQuestion._id.toString(),
              );

              subscriber.next({
                data: {
                  status: 'success',
                  message: '題目已就緒',
                  data: finalQuestion,
                },
              } as MessageEvent);
            } else {
              // Forward progress events
              subscriber.next({ data: update } as MessageEvent);
            }
          }
          subscriber.complete();
        } catch (err: any) {
          console.error('[SSE] Stream Error:', err);
          subscriber.next({
            data: { status: 'error', message: err.message || 'Unknown error' },
          } as MessageEvent);
          subscriber.complete();
        }
      };

      process();
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateQuestionDto: UpdateQuestionDto,
  ) {
    return this.questionsService.update(id, updateQuestionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.questionsService.remove(id);
  }

  @Get('next/:category')
  async getNext(
    @Param('category') category: string,
    @Request() req: any,
    @Query('force') force: string,
  ) {
    const userId = req.user.sub;
    const forceNew = force === 'true';

    // Try to get question from DB first (unless forced)
    let question = await this.questionsService.getNextQuestion(
      userId,
      category,
      forceNew,
    );

    // If no question available in DB, generate a new one
    if (!question) {
      // Get category info from DB for better AI topic context
      const categoryInfo =
        await this.categoriesService.findBySlugOnly(category);
      const topic = categoryInfo
        ? `${categoryInfo.name}${categoryInfo.description ? ` - ${categoryInfo.description}` : ''}`
        : `Python ${category}`;

      const questionData = await this.geminiService.generateQuestion(
        topic,
        userId,
        categoryInfo?.guidelines || '',
      );

      // Save to DB with generation metadata
      question = await this.questionsService.create({
        category,
        ...questionData,
        generatedBy: userId,
        generatedAt: new Date(),
        isAIGenerated: true,
      } as any);

      // Populate tags before returning to ensuring frontend gets full objects
      await question.populate('tags');

      console.log(
        `AI generated question saved: ${String(question._id)} by user ${userId} at ${new Date().toISOString()}`,
      );

      // Record generation in UserProgress immediately so it appears in Session History
      await this.questionsService.recordQuestionGeneration(
        userId,
        question._id.toString(),
        category,
        question.subjectId?.toString(),
        question.categoryId?.toString(),
      );
    }

    return question;
  }

  /**
   * Submit answer and record user progress
   */
  @UseGuards(JwtAuthGuard)
  @Post(':id/submit')
  async submit(
    @Param('id') questionId: string,
    @Request() req: any,
    @Body() body: { code: string; isCorrect: boolean; category: string },
  ) {
    const userId = req.user.sub;
    const { code, isCorrect, category } = body;

    const question = await this.questionsService.findOne(questionId);

    const progress = await this.questionsService.recordAttempt(
      userId,
      questionId,
      category,
      code,
      isCorrect,
      question.subjectId?.toString(),
      question.categoryId?.toString(),
    );

    return { success: true, progress };
  }

  /**
   * Get AI hint for current code
   */
  @UseGuards(JwtAuthGuard)
  @Post('hint')
  async getHint(
    @Request() req: any,
    @Body() body: { questionId: string; code: string },
  ) {
    const { questionId, code } = body;
    const question = await this.questionsService.findOne(questionId);

    if (!question) {
      return { error: 'Question not found' };
    }

    // Convert Mongoose document to plain object for interface matching if needed
    // or pass directly if type compatible.
    // GeminiService expects QuestionData interface.
    const questionData: QuestionData = {
      title: question.title,
      description: question.description,
      sampleInput: question.sampleInput,
      sampleOutput: question.sampleOutput,
      samples: question.samples || [],
      testCases: question.testCases,
      tags: (question.tags || []).map((t) => t.toString()),
      difficulty: (question.difficulty as 'easy' | 'medium' | 'hard') || 'easy',
      constraints: question.constraints,
    };

    const userId = req.user.sub;
    const hint = await this.geminiService.generateHint(questionData, code, userId);
    return { hint };
  }

  /**
   * Get user statistics for all categories
   */
  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async getAllStats(@Request() req: any) {
    const userId = req.user.sub;
    return this.questionsService.getUserStats(userId);
  }

  /**
   * Get user statistics for specific category
   */
  @UseGuards(JwtAuthGuard)
  @Get('stats/:category')
  async getStats(@Param('category') category: string, @Request() req: any) {
    const userId = req.user.sub;
    return this.questionsService.getUserStats(userId, category);
  }

  /**
   * Get user's question history for specific category
   */
  @UseGuards(JwtAuthGuard)
  @Get('history/:category')
  async getHistory(@Param('category') category: string, @Request() req: any) {
    const userId = req.user.sub;
    return this.questionsService.getHistory(userId, category);
  }
}
