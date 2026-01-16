import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category } from './schemas/category.schema';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<Category>,
  ) {}

  /**
   * Get all categories for a subject
   */
  async findBySubject(subjectId: string): Promise<Category[]> {
    return this.categoryModel
      .find({ subjectId: new Types.ObjectId(subjectId) })
      .sort({ order: 1 })
      .exec();
  }

  /**
   * Get category by slug within a subject
   */
  async findBySlug(
    subjectId: string,
    slug: string,
  ): Promise<Category | null> {
    return this.categoryModel
      .findOne({ subjectId: new Types.ObjectId(subjectId), slug })
      .exec();
  }

  /**
   * Get category by ID
   */
  async findById(id: string): Promise<Category | null> {
    return this.categoryModel.findById(id).exec();
  }

  /**
   * Create new category
   */
  async create(categoryData: Partial<Category>): Promise<Category> {
    const category = new this.categoryModel(categoryData);
    return category.save();
  }

  /**
   * Update category
   */
  async update(
    id: string,
    categoryData: Partial<Category>,
  ): Promise<Category | null> {
    return this.categoryModel
      .findByIdAndUpdate(id, categoryData, { new: true })
      .exec();
  }

  /**
   * Delete category
   */
  async delete(id: string): Promise<Category | null> {
    return this.categoryModel.findByIdAndDelete(id).exec();
  }
}
