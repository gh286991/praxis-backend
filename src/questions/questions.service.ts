import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { Question } from './schemas/question.schema';
import { UserProgress } from './schemas/user-progress.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectModel(Question.name) private questionModel: Model<Question>,
    @InjectModel(UserProgress.name)
    private userProgressModel: Model<UserProgress>,
    private usersService: UsersService,
  ) {}

  async create(createQuestionDto: CreateQuestionDto): Promise<Question> {
    const createdQuestion = new this.questionModel(createQuestionDto);
    return createdQuestion.save();
  }

  async findAll(): Promise<Question[]> {
    return this.questionModel.find().exec();
  }

  async findOne(id: string, includeSecret: boolean = false): Promise<Question> {
    const query = this.questionModel.findById(id).populate('tags');
    
    // Explicitly include fileAssets (it's select:false in schema)
    // And if includeSecret is true, also include referenceCode
    let selectFields = '+fileAssets';
    if (includeSecret) {
      selectFields += ' +referenceCode';
    }
    
    query.select(selectFields);

    const question = await query.exec();
    if (!question) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }
    return question;
  }

  async update(
    id: string,
    updateQuestionDto: UpdateQuestionDto,
  ): Promise<Question> {
    const updatedQuestion = await this.questionModel
      .findByIdAndUpdate(id, updateQuestionDto, { new: true })
      .exec();
    if (!updatedQuestion) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }
    return updatedQuestion;
  }

  async remove(id: string): Promise<Question> {
    const deletedQuestion = await this.questionModel
      .findByIdAndDelete(id)
      .exec();
    if (!deletedQuestion) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }
    return deletedQuestion;
  }

  /**
   * Get list of questions for a specific category (for sidebar navigation)
   */
  async getList(categorySlug: string): Promise<any[]> {
    // 1. Find category first to get _id? or just query by category string if legacy?
    // Current schema has 'category' string field provided by controller.
    // However, for new structure we might want to query by categoryId or category slug.

    // For now, let's query by the 'category' field which matches the slug passed from frontend params
    const questions = await this.questionModel
      .find({ category: categorySlug })
      .select('title _id generatedBy isAIGenerated difficulty') // Select minimal fields
      .sort({ title: 1 }) // Sort by title (e.g. Q1, Q2) - might need better sorting for mocked exams
      .exec();

    // Enhancment: Sort by extracting Q number if possible
    return questions.sort((a, b) => {
      // Basic alpha sort, simple
      return a.title.localeCompare(b.title, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }

  /**
   * Get next question by subjectId and categoryId (new architecture)
   */
  async getNextQuestionByIds(
    userId: string,
    subjectId: string,
    categoryId: string,
    force: boolean = false,
  ): Promise<Question | null> {
    console.log(
      `Getting next question for user ${userId} in subject ${subjectId}, category ${categoryId}, force: ${force}`,
    );

    if (force) {
      console.log('Force true, bypassing DB check');
      return null;
    }

    // Get attempted questions
    const attemptedQuestions = await this.userProgressModel
      .find({
        userId: new Types.ObjectId(userId),
        subjectId: new Types.ObjectId(subjectId),
        categoryId: new Types.ObjectId(categoryId),
      })
      .select('questionId')
      .exec();

    const attemptedQuestionIds = attemptedQuestions.map((up) => up.questionId);

    // Find unattempted question
    const availableQuestion = await this.questionModel
      .findOne({
        subjectId: new Types.ObjectId(subjectId),
        categoryId: new Types.ObjectId(categoryId),
        _id: { $nin: attemptedQuestionIds },
      })
      .sort({ usedCount: 1 })
      .sort({ usedCount: 1 })
      .populate('tags')
      .exec();

    return availableQuestion;
  }

  /**
   * Get next question for user in specific category (legacy, backward compatible)
   * Returns a question from DB that user hasn't attempted yet
   * Returns null if no unused questions available (unless force=true)
   */
  async getNextQuestion(
    userId: string,
    category: string,
    force: boolean = false,
  ): Promise<Question | null> {
    console.log(
      `Getting next question for user ${userId} in category ${category}, force: ${force}`,
    );

    if (force) {
      console.log(
        'Force true, bypassing DB check to return null (triggering generation)',
      );
      return null; // Return null to trigger generation in controller
    }

    // Get all question IDs the user has already attempted in this category
    const attemptedQuestions = await this.userProgressModel
      .find({ userId: new Types.ObjectId(userId), category })
      .select('questionId')
      .exec();

    const attemptedQuestionIds = attemptedQuestions.map((up) => up.questionId);
    console.log(
      `User has attempted ${attemptedQuestionIds.length} questions:`,
      attemptedQuestionIds,
    );

    // Find a question in this category that user hasn't attempted
    const availableQuestion = await this.questionModel
      .findOne({
        category,
        _id: { $nin: attemptedQuestionIds },
      })
      .sort({ usedCount: 1 }) // Prefer less-used questions
      .sort({ usedCount: 1 }) // Prefer less-used questions
      .populate('tags')
      .exec();

    if (availableQuestion) {
      console.log(`Found available question from DB: ${availableQuestion._id}`);
    } else {
      console.log('No available question in DB, will generate new one.');
    }

    return availableQuestion;
  }

  /**
   * Record that a user has started working on a question (when generated)
   * This creates an initial UserProgress record so the question appears in history immediately
   */
  async recordQuestionGeneration(
    userId: string,
    questionId: string,
    category: string,
    subjectId?: string,
    categoryId?: string,
  ): Promise<UserProgress> {
    console.log(
      `Recording question generation for user ${userId}, question ${questionId}`,
    );

    // Check if record already exists (user might have seen this question before)
    const existingProgress = await this.userProgressModel
      .findOne({
        userId: new Types.ObjectId(userId),
        questionId: new Types.ObjectId(questionId),
      })
      .exec();

    if (existingProgress) {
      // Already exists, just update the attemptedAt time to show it's active
      existingProgress.attemptedAt = new Date();
      await existingProgress.save();
      console.log(`Question already in history, updated timestamp`);
      return existingProgress;
    }

    // Create initial record
    const initialProgress = new this.userProgressModel({
      userId: new Types.ObjectId(userId),
      questionId: new Types.ObjectId(questionId),
      category,
      code: '', // Empty initially
      isCorrect: false, // Not attempted yet
      attemptCount: 0, // Not submitted yet
      passedCount: 0,
      failedCount: 0,
      attemptedAt: new Date(),
      firstAttemptedAt: new Date(),
    });

    // Add new architecture fields if provided
    if (subjectId && categoryId) {
      initialProgress.subjectId = new Types.ObjectId(subjectId);
      initialProgress.categoryId = new Types.ObjectId(categoryId);
    }

    const savedProgress = await initialProgress.save();

    console.log(`Initial progress created: ${savedProgress._id}`);

    return savedProgress;
  }

  /**
   * Record user's attempt at a question (upsert mode - one record per question)
   */
  async recordAttempt(
    userId: string,
    questionId: string,
    category: string,
    code: string,
    isCorrect: boolean,
    subjectId?: string,
    categoryId?: string,
  ): Promise<UserProgress> {
    console.log(
      `Recording attempt for user ${userId}, question ${questionId}, correct: ${isCorrect}`,
    );

    // Use findOneAndUpdate with upsert to maintain one record per user per question
    const updateData: any = {
      $set: {
        category,
        code,
        attemptedAt: new Date(),
      },
      $setOnInsert: {
        firstAttemptedAt: new Date(),
        isCorrect: isCorrect,
      },
      $inc: {
        attemptCount: 1,
        ...(isCorrect ? { passedCount: 1 } : { failedCount: 1 }),
      },
    };

    // Add subjectId and categoryId if provided (new architecture)
    if (subjectId && categoryId) {
      updateData.$set.subjectId = new Types.ObjectId(subjectId);
      updateData.$set.categoryId = new Types.ObjectId(categoryId);
    }

    // First, check if this question progress already exists
    const existingProgress = await this.userProgressModel
      .findOne({
        userId: new Types.ObjectId(userId),
        questionId: new Types.ObjectId(questionId),
      })
      .exec();

    const isFirstAttempt = !existingProgress;

    const progress = await this.userProgressModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          questionId: new Types.ObjectId(questionId),
        },
        updateData,
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();

    // If user passed this time, update isCorrect to true (once passed, stays passed)
    if (isCorrect && !progress.isCorrect) {
      progress.isCorrect = true;
      await progress.save();
    }

    console.log(
      `Progress upserted: ${progress._id}, attempts: ${progress.attemptCount}, passed: ${progress.passedCount}`,
    );

    // Increment question usage count
    await this.questionModel
      .findByIdAndUpdate(questionId, { $inc: { usedCount: 1 } })
      .exec();

    // Update UserProfile statistics
    await this.updateProfileStats(userId, isCorrect, isFirstAttempt);

    return progress;
  }

  /**
   * Get user statistics for a category
   */
  async getUserStats(userId: string, category?: string) {
    const filter: any = { userId: new Types.ObjectId(userId) };
    if (category) {
      filter.category = category;
    }

    const total = await this.userProgressModel.countDocuments(filter).exec();
    const correct = await this.userProgressModel
      .countDocuments({
        ...filter,
        isCorrect: true,
      })
      .exec();

    return {
      total,
      correct,
      accuracy: total > 0 ? (correct / total) * 100 : 0,
    };
  }

  /**
   * Append new messages to chat history without truncating
   */
  async appendChatHistory(
    userId: string,
    questionId: string,
    newMessages: { role: 'user' | 'model'; message: string; timestamp?: Date }[],
  ): Promise<void> {
    
    // Add timestamp if missing
    const messagesWithTime = newMessages.map(msg => ({
      ...msg,
      timestamp: msg.timestamp || new Date()
    }));

    await this.userProgressModel.findOneAndUpdate(
       {
         userId: new Types.ObjectId(userId),
         questionId: new Types.ObjectId(questionId),
       },
       {
         $push: { 
            chatHistory: { $each: messagesWithTime } 
         }
       },
       { new: true, upsert: true, setDefaultsOnInsert: true }
    ).exec();
  }

  /**
   * Get chat history with pagination
   * @param limit Number of messages to return (default 20 = 10 exchanges)
   * @param before Timestamp cursor to fetch messages before (for loading older history)
   */
  async getChatHistoryDetail(userId: string, questionId: string, limit: number = 20, before?: Date) {
    // If 'before' is specified, we perform an aggregation to filter and slice.
    // If not, we can use simple slice for the most recent messages.
    
    const uid = new Types.ObjectId(userId);
    const qid = new Types.ObjectId(questionId);

    if (!before) {
        // Simple case: Get last N messages
        // projection: { chatHistory: { $slice: -limit } }
        const progress = await this.userProgressModel.findOne(
            { userId: uid, questionId: qid },
            { chatHistory: { $slice: -limit } }
        ).exec();
        return progress?.chatHistory || [];
    } else {
        // Pagination case: Fetch messages strictly before the 'before' timestamp
        // Since standard find/projection doesn't support filtering inside array easily, we use aggregation
        const pipeline = [
            { $match: { userId: uid, questionId: qid } },
            { 
              $project: {
                chatHistory: {
                  $filter: {
                    input: '$chatHistory',
                    as: 'msg',
                    cond: { $lt: ['$$msg.timestamp', new Date(before)] }
                  }
                }
              }
            },
            // The filtered array might still be huge. We want the *last* N of this filtered set (closest to 'before')
            { $project: { chatHistory: { $slice: ['$chatHistory', -limit] } } }
        ];
        
        const result = await this.userProgressModel.aggregate(pipeline).exec();
        return result[0]?.chatHistory || [];
    }
  }

  /**
   * Get user's question history for a specific category
   */
  async getHistory(userId: string, category: string) {
    console.log(`Getting history for user ${userId}, category ${category}`);
    const history = await this.userProgressModel
      .find({ userId: new Types.ObjectId(userId), category })
      .sort({ attemptedAt: -1 })
      .populate('questionId', 'title')
      .exec();

    console.log(`Found ${history.length} history records`);

    return history
      .map((record) => {
        // Handle case where question might have been deleted
        if (!record.questionId) {
          console.warn(
            `History record ${record._id} has missing question reference`,
          );
          return null;
        }

        const question = record.questionId as any;
        return {
          questionId: question._id,
          title: question.title,
          isCorrect: record.isCorrect,
          attemptedAt: record.attemptedAt,
          code: record.code, // Optional: if we want to show their code
        };
      })
      .filter((item) => item !== null);
  }

  /**
   * Update UserProfile statistics when a question is attempted
   */
  private async updateProfileStats(
    userId: string,
    isCorrect: boolean,
    isFirstAttempt: boolean,
  ): Promise<void> {
    try {
      const profile = await this.usersService.findOrCreateProfile(userId);

      // Only increment totalQuestionsCompleted on first attempt
      if (isFirstAttempt) {
        profile.totalQuestionsCompleted += 1;
      }

      // Only increment totalQuestionsPassed if correct and not already passed
      if (isCorrect && isFirstAttempt) {
        profile.totalQuestionsPassed += 1;
      }

      await profile.save();
      console.log(
        `Updated profile stats for user ${userId}: completed=${profile.totalQuestionsCompleted}, passed=${profile.totalQuestionsPassed}`,
      );
    } catch (error) {
      console.error('Failed to update profile stats:', error);
      // Don't throw - we don't want to fail the question submission if profile update fails
    }
  }
}
