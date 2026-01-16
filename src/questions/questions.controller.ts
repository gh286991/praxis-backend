import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards, Query } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GeminiService } from '../gemini/gemini.service';

@Controller('questions')
export class QuestionsController {
  constructor(
    private readonly questionsService: QuestionsService,
    private readonly geminiService: GeminiService,
  ) {}

  @Post()
  create(@Body() createQuestionDto: CreateQuestionDto) {
    return this.questionsService.create(createQuestionDto);
  }

  @Get()
  findAll() {
    return this.questionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateQuestionDto: UpdateQuestionDto) {
    return this.questionsService.update(id, updateQuestionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.questionsService.remove(id);
  }

  /**
   * Get next question for authenticated user in specific category
   * Returns from DB if available, otherwise generates new one
   */
  @UseGuards(JwtAuthGuard)
  @Get('next/:category')
  async getNext(
    @Param('category') category: string, 
    @Request() req: any,
    @Query('force') force: string
  ) {
    const userId = req.user.sub;
    const forceNew = force === 'true';
    
    // Try to get question from DB first (unless forced)
    let question = await this.questionsService.getNextQuestion(userId, category, forceNew);
    
    // If no question available in DB, generate a new one
    if (!question) {
      const topicMap: Record<string, string> = {
        category1: 'Basic Programming Design',
        category2: 'Selection Statements',
        category3: 'Repetition Structures',
        category4: 'Complex Data Structures',
        category5: 'Functions',
        category6: 'List Comprehension and String Operations',
        category7: 'Complex Data Structures',
        category8: 'List Comprehension and String Operations',
        category9: 'Error Handling and Files',
      };

      const topic = topicMap[category] || 'Basic Programming Design';
      const questionData = await this.geminiService.generateQuestion(topic);
      
      // Save to DB
      question = await this.questionsService.create({
        category,
        ...questionData,
      });
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
    
    const progress = await this.questionsService.recordAttempt(
      userId,
      questionId,
      category,
      code,
      isCorrect,
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
    const questionData = {
      title: question.title,
      description: question.description,
      sampleInput: question.sampleInput,
      sampleOutput: question.sampleOutput,
      testCases: question.testCases,
    };

    const hint = await this.geminiService.generateHint(questionData, code);
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
