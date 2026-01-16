import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subject } from './schemas/subject.schema';
import { Category } from './schemas/category.schema';
import { UserProgress } from './schemas/user-progress.schema';

export interface ProgressStats {
  totalQuestions: number;
  completedQuestions: number;
  passedQuestions: number;
  failedQuestions: number;
  completionRate: number;
  passRate: number;
}

export interface SubjectStats extends ProgressStats {
  subjectId: string;
  subjectName: string;
  subjectSlug: string;
  categories: CategoryStats[];
}

export interface CategoryStats extends ProgressStats {
  categoryId: string;
  categoryName: string;
  categorySlug: string;
}

@Injectable()
export class StatsService {
  constructor(
    @InjectModel(Subject.name) private subjectModel: Model<Subject>,
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    @InjectModel(UserProgress.name)
    private userProgressModel: Model<UserProgress>,
  ) {}

  /**
   * Get user's progress statistics for a specific subject
   */
  async getSubjectStats(
    userId: string,
    subjectSlug: string,
  ): Promise<SubjectStats | null> {
    // Find subject
    const subject = await this.subjectModel.findOne({ slug: subjectSlug });
    if (!subject) return null;

    // Get all categories for this subject
    const categories = await this.categoryModel
      .find({ subjectId: subject._id })
      .sort({ order: 1 });

    const categoryStats: CategoryStats[] = [];

    for (const category of categories) {
      const stats = await this.getCategoryStats(
        userId,
        subject._id.toString(),
        category._id.toString(),
      );

      categoryStats.push({
        categoryId: category._id.toString(),
        categoryName: category.name,
        categorySlug: category.slug,
        ...stats,
      });
    }

    // Calculate overall subject stats
    const totalQuestions = categoryStats.reduce(
      (sum, cat) => sum + cat.totalQuestions,
      0,
    );
    const completedQuestions = categoryStats.reduce(
      (sum, cat) => sum + cat.completedQuestions,
      0,
    );
    const passedQuestions = categoryStats.reduce(
      (sum, cat) => sum + cat.passedQuestions,
      0,
    );

    return {
      subjectId: subject._id.toString(),
      subjectName: subject.name,
      subjectSlug: subject.slug,
      totalQuestions,
      completedQuestions,
      passedQuestions,
      failedQuestions: completedQuestions - passedQuestions,
      completionRate:
        totalQuestions > 0 ? (completedQuestions / totalQuestions) * 100 : 0,
      passRate:
        completedQuestions > 0
          ? (passedQuestions / completedQuestions) * 100
          : 0,
      categories: categoryStats,
    };
  }

  /**
   * Get user's progress for a specific category
   */
  async getCategoryStats(
    userId: string,
    subjectId: string,
    categoryId: string,
  ): Promise<ProgressStats> {
    // Count total questions in category (assuming we'll have this data)
    // For now, we'll count attempted questions
    const progress = await this.userProgressModel
      .find({
        userId: new Types.ObjectId(userId),
        subjectId: new Types.ObjectId(subjectId),
        categoryId: new Types.ObjectId(categoryId),
      })
      .exec();

    const completedQuestions = progress.length;
    const passedQuestions = progress.filter((p) => p.isCorrect).length;
    const failedQuestions = completedQuestions - passedQuestions;

    return {
      totalQuestions: completedQuestions, // Will need to update when we know total
      completedQuestions,
      passedQuestions,
      failedQuestions,
      completionRate: 100, // Placeholder
      passRate:
        completedQuestions > 0
          ? (passedQuestions / completedQuestions) * 100
          : 0,
    };
  }

  /**
   * Get overall stats for all subjects
   */
  async getAllSubjectsStats(userId: string): Promise<SubjectStats[]> {
    const subjects = await this.subjectModel.find({ isActive: true });
    const stats: SubjectStats[] = [];

    for (const subject of subjects) {
      const subjectStats = await this.getSubjectStats(
        userId,
        subject.slug,
      );
      if (subjectStats) {
        stats.push(subjectStats);
      }
    }

    return stats;
  }
}
