import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { Question } from './schemas/question.schema';
import { UserProgress } from './schemas/user-progress.schema';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectModel(Question.name) private questionModel: Model<Question>,
    @InjectModel(UserProgress.name) private userProgressModel: Model<UserProgress>,
  ) {}

  async create(createQuestionDto: CreateQuestionDto): Promise<Question> {
    const createdQuestion = new this.questionModel(createQuestionDto);
    return createdQuestion.save();
  }

  async findAll(): Promise<Question[]> {
    return this.questionModel.find().exec();
  }

  async findOne(id: string): Promise<Question> {
    const question = await this.questionModel.findById(id).exec();
    if (!question) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }
    return question;
  }

  async update(id: string, updateQuestionDto: UpdateQuestionDto): Promise<Question> {
    const updatedQuestion = await this.questionModel
      .findByIdAndUpdate(id, updateQuestionDto, { new: true })
      .exec();
    if (!updatedQuestion) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }
    return updatedQuestion;
  }

  async remove(id: string): Promise<Question> {
    const deletedQuestion = await this.questionModel.findByIdAndDelete(id).exec();
    if (!deletedQuestion) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }
    return deletedQuestion;
  }

  /**
   * Get next question for user in specific category
   * Returns a question from DB that user hasn't attempted yet
   * Returns null if no unused questions available (unless force=true)
   */
  async getNextQuestion(userId: string, category: string, force: boolean = false): Promise<Question | null> {
    console.log(`Getting next question for user ${userId} in category ${category}, force: ${force}`);
    
    if (force) {
        console.log('Force true, bypassing DB check to return null (triggering generation)');
        return null; // Return null to trigger generation in controller
    }

    // Get all question IDs the user has already attempted in this category
    const attemptedQuestions = await this.userProgressModel
      .find({ userId: new Types.ObjectId(userId), category })
      .select('questionId')
      .exec();

    const attemptedQuestionIds = attemptedQuestions.map(up => up.questionId);
    console.log(`User has attempted ${attemptedQuestionIds.length} questions:`, attemptedQuestionIds);

    // Find a question in this category that user hasn't attempted
    const availableQuestion = await this.questionModel
      .findOne({
        category,
        _id: { $nin: attemptedQuestionIds },
      })
      .sort({ usedCount: 1 }) // Prefer less-used questions
      .exec();

    if (availableQuestion) {
        console.log(`Found available question from DB: ${availableQuestion._id}`);
    } else {
        console.log('No available question in DB, will generate new one.');
    }

    return availableQuestion;
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
  ): Promise<UserProgress> {
    console.log(`Recording attempt for user ${userId}, question ${questionId}, correct: ${isCorrect}`);
    
    // Use findOneAndUpdate with upsert to maintain one record per user per question
    const progress = await this.userProgressModel.findOneAndUpdate(
      { 
        userId: new Types.ObjectId(userId), 
        questionId: new Types.ObjectId(questionId) 
      },
      {
        $set: {
          category,
          code, // Update to last submitted code
          attemptedAt: new Date(), // Update last attempt time
        },
        $setOnInsert: {
          firstAttemptedAt: new Date(), // Only set on first insert
          isCorrect: isCorrect, // Initial value
        },
        $inc: {
          attemptCount: 1,
          ...(isCorrect ? { passedCount: 1 } : { failedCount: 1 }),
        },
      },
      { 
        upsert: true, 
        new: true, // Return updated document
        setDefaultsOnInsert: true 
      }
    ).exec();

    // If user passed this time, update isCorrect to true (once passed, stays passed)
    if (isCorrect && !progress.isCorrect) {
      progress.isCorrect = true;
      await progress.save();
    }

    console.log(`Progress upserted: ${progress._id}, attempts: ${progress.attemptCount}, passed: ${progress.passedCount}`);

    // Increment question usage count
    await this.questionModel
      .findByIdAndUpdate(questionId, { $inc: { usedCount: 1 } })
      .exec();

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
    const correct = await this.userProgressModel.countDocuments({
      ...filter,
      isCorrect: true,
    }).exec();

    return {
      total,
      correct,
      accuracy: total > 0 ? (correct / total) * 100 : 0,
    };
  }

  /**
   * Get user's question history for a specific category
   */
  async getHistory(userId: string, category: string) {
    const history = await this.userProgressModel
      .find({ userId: new Types.ObjectId(userId), category })
      .sort({ attemptedAt: -1 })
      .populate('questionId', 'title')
      .exec();

    return history.map(record => {
      // Handle case where question might have been deleted
      if (!record.questionId) return null;
      
      const question = record.questionId as any;
      return {
        questionId: question._id,
        title: question.title,
        isCorrect: record.isCorrect,
        attemptedAt: record.attemptedAt,
        code: record.code, // Optional: if we want to show their code
      };
    }).filter(item => item !== null);
  }
}
