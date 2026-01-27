import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import AdmZip from 'adm-zip';
import { Subject } from '../questions/schemas/subject.schema';
import { Category } from '../questions/schemas/category.schema';
import { Question } from '../questions/schemas/question.schema';
import { Tag, TagCategory } from '../questions/schemas/tag.schema'; // Import Tag
import { SubjectsService } from '../questions/subjects.service';
import { CategoriesService } from '../questions/categories.service';
import { QuestionsService } from '../questions/questions.service';

interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Removed import { Express } from 'express';


@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly subjectsService: SubjectsService,
    private readonly categoriesService: CategoriesService,
    private readonly questionsService: QuestionsService,
    @InjectModel(Subject.name) private subjectModel: Model<Subject>,
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    @InjectModel(Question.name) private questionModel: Model<Question>,
    @InjectModel(Tag.name) private tagModel: Model<Tag>, // Inject Tag Model
  ) {}

  async processImport(file: MulterFile, subjectId?: string) {
    this.logger.log(`Processing import: ${file.originalname}`);

    let subject: Subject | null = null;
    if (subjectId) {
      if (Types.ObjectId.isValid(subjectId)) {
        subject = await this.subjectsService.findById(subjectId);
      } else {
        // Try finding by slug if not a valid ObjectId
        subject = await this.subjectsService.findBySlug(subjectId);
      }
    }

    if (!subject) {
      // 1. Fallback: Ensure "Mock Exams" subject exists
      subject = await this.ensureMockExamSubject();
    }

    this.logger.log(`Using Subject: ${subject.name} (${subject._id})`);

    // Extract exam name from filename (e.g., "Exam-2.zip" → "Exam-2")
    const examName = file.originalname
      .replace(/\.zip$/i, '')
      .replace(/\.json$/i, '');

    let processedCount = 0;
    const errors: { file: string; error: string }[] = [];

    // 2. Process file based on type
    if (file.mimetype.includes('zip') || file.originalname.endsWith('.zip')) {
      const zip = new AdmZip(file.buffer);
      const zipEntries = zip.getEntries();

      for (const entry of zipEntries) {
        // Skip macOS system files and folders
        if (
          entry.entryName.includes('__MACOSX') ||
          entry.entryName.includes('/._') ||
          entry.entryName.startsWith('._')
        ) {
          continue;
        }

        if (!entry.isDirectory && entry.entryName.endsWith('.json')) {
          try {
            const content = entry.getData().toString('utf8');
            const json = JSON.parse(content);
            await this.importQuestion(json, subject, entry.entryName, examName);
            processedCount++;
          } catch (e) {
            this.logger.error(
              `Failed to process ${entry.entryName}: ${(e as Error).message}`,
            );
            errors.push({ file: entry.entryName, error: (e as Error).message });
          }
        }
      }
    } else if (
      file.mimetype.includes('json') ||
      file.originalname.endsWith('.json')
    ) {
      try {
        const content = file.buffer.toString('utf8');
        const json = JSON.parse(content);
        await this.importQuestion(json, subject, file.originalname, examName);
        processedCount++;
      } catch (e) {
        this.logger.error(
          `Failed to process ${file.originalname}: ${(e as Error).message}`,
        );
        errors.push({ file: file.originalname, error: (e as Error).message });
      }
    }

    return {
      processed: processedCount,
      errors: errors,
      subjectId: subject._id,
    };
  }

  private async ensureMockExamSubject(): Promise<Subject> {
    const slug = 'mock-exams';
    let subject = await this.subjectsService.findBySlug(slug);

    if (!subject) {
      subject = await this.subjectsService.create({
        name: '模擬試題',
        slug: slug,
        description: '匯入的模擬試卷練習題庫',
        language: 'python',
        icon: '📝',
        color: '#F43F5E', // Rose-500
        isActive: true,
      });
      this.logger.log('Created new Mock Exam Subject');
    }
    return subject;
  }

  private async importQuestion(
    data: any,
    subject: Subject,
    filename: string,
    examName: string,
  ) {
    // Extract question number from filename (e.g., "q7.json" -> "Q7")
    const questionNumber = filename.match(/q(\d+)\.json$/i)?.[1] || '';
    const questionPrefix = questionNumber ? `Q${questionNumber}` : '';

    // 1. Use examName directly as Category (e.g., "Exam-2")
    const categorySlug = examName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // 2. Ensure Category Exists
    let category = await this.categoryModel
      .findOne({
        slug: categorySlug,
        subjectId: subject._id,
      })
      .exec();

    if (!category) {
      category = new this.categoryModel({
        subjectId: subject._id,
        name: examName,
        slug: categorySlug,
        description: `${examName} 練習題`,
        type: 'EXAM',
        order: 99,
      });
      await category.save();
      this.logger.log(`Created new Category: ${category.name}`);
    }

    // 3. Process Tags
    const tagIds: Types.ObjectId[] = [];

    // Method A: Explicit tags from JSON
    if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
      for (const tagName of data.tags) {
        try {
          const safeName =
            typeof tagName === 'string' ? tagName.trim() : String(tagName);
          const tagSlug = safeName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

          if (!tagSlug) continue;

          // Find or Create Tag
          let tag = await this.tagModel.findOne({ slug: tagSlug }).exec();
          if (!tag) {
            tag = new this.tagModel({
              name: safeName,
              slug: tagSlug,
              type: TagCategory.CONCEPT, // Default type
              usedCount: 0,
            });
            await tag.save();
            this.logger.log(`Created new Tag: ${tag.name}`);
          }

          tagIds.push(tag._id); // Cast to ObjectId

          // Increment usage count (optional optimization)
          await this.tagModel.updateOne(
            { _id: tag._id },
            { $inc: { usedCount: 1 } },
          );
        } catch (e) {
          this.logger.warn(`Failed to process tag '${tagName}': ${e.message}`);
        }
      }
    }

    // Method B: Fallback to Category inference if no tags
    if (tagIds.length === 0 && data.category) {
      try {
        const tagName = data.category.trim();
        const tagSlug = tagName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

        let tag = await this.tagModel.findOne({ slug: tagSlug }).exec();
        if (!tag) {
          tag = new this.tagModel({
            name: tagName,
            slug: tagSlug,
            type: TagCategory.CONCEPT,
          });
          await tag.save();
        }
        tagIds.push(tag._id);
      } catch (e) {
        this.logger.warn(
          `Failed to process fallback tag for ${data.category}: ${e.message}`,
        );
      }
    }

    // 4. Validate and Sanitize TestCases
    // Filter out test cases with missing input/output
    // Filter test cases: must have non-empty input and output strings
    // Preserve additional fields: fileAssets, type, description
    const validTestCases = (data.testCases || [])
      .filter((tc: any) => {
        return (
          tc &&
          typeof tc.input === 'string' &&
          typeof tc.output === 'string' &&
          tc.input.trim() !== '' &&
          tc.output.trim() !== ''
        );
      })
      .map((tc: any) => ({
        input: tc.input,
        output: tc.output,
        type: tc.type || undefined,
        description: tc.description || undefined,
        fileAssets: tc.fileAssets || undefined,
      }));

    // 3. Upsert Question
    const questionData = {
      subjectId: subject._id,
      categoryId: category._id,
      category: category.slug, // Legacy
      title: questionPrefix
        ? `${questionPrefix}: ${data.title || data.category || 'Python Question'}`
        : data.title || `Mock Question ${Date.now()}`,
      description: data.description || 'No description provided',
      sampleInput: data.samples?.[0]?.input || '',
      sampleOutput: data.samples?.[0]?.output || '',
      samples: (data.samples || []).map((s: any) => ({
        input: s.input,
        output: s.output,
        explanation: s.explanation || undefined,
        fileAssets: s.fileAssets || undefined,
      })),
      testCases: validTestCases,
      difficulty: data.difficulty ? data.difficulty.toLowerCase() : 'medium', // Use difficulty from JSON if available
      isAIGenerated: false,
      generatedAt: new Date(),
      tags: tagIds,
      referenceCode: data.referenceCode || '',
      fileAssets: data.fileAssets || {},
    };

    // Try to find existing by title/category to update
    let question = await this.questionModel.findOne({
      subjectId: subject._id,
      categoryId: category._id,
      title: questionData.title,
    });

    if (question) {
      // Update
      Object.assign(question, questionData);
      await question.save();
      this.logger.log(`Updated question: ${question.title}`);
    } else {
      // Create
      question = new this.questionModel(questionData);
      await question.save();
      this.logger.log(`Created question: ${question.title}`);
    }
  }
}
