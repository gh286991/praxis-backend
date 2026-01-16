import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subject } from './schemas/subject.schema';

@Injectable()
export class SubjectsService {
  constructor(
    @InjectModel(Subject.name) private subjectModel: Model<Subject>,
  ) {}

  /**
   * Get all active subjects
   */
  async findAll(includeInactive = false): Promise<Subject[]> {
    const filter = includeInactive ? {} : { isActive: true };
    return this.subjectModel.find(filter).sort({ name: 1 }).exec();
  }

  /**
   * Get subject by slug
   */
  async findBySlug(slug: string): Promise<Subject | null> {
    return this.subjectModel.findOne({ slug }).exec();
  }

  /**
   * Get subject by ID
   */
  async findById(id: string): Promise<Subject | null> {
    return this.subjectModel.findById(id).exec();
  }

  /**
   * Create new subject
   */
  async create(subjectData: Partial<Subject>): Promise<Subject> {
    const subject = new this.subjectModel(subjectData);
    return subject.save();
  }

  /**
   * Update subject
   */
  async update(id: string, subjectData: Partial<Subject>): Promise<Subject | null> {
    return this.subjectModel
      .findByIdAndUpdate(id, subjectData, { new: true })
      .exec();
  }

  /**
   * Delete subject
   */
  async delete(id: string): Promise<Subject | null> {
    return this.subjectModel.findByIdAndDelete(id).exec();
  }
}
