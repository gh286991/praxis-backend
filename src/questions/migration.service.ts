import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subject } from './schemas/subject.schema';
import { Category } from './schemas/category.schema';
import { Question } from './schemas/question.schema';

@Injectable()
export class MigrationService {
  constructor(
    @InjectModel(Subject.name) private subjectModel: Model<Subject>,
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    @InjectModel(Question.name) private questionModel: Model<Question>,
  ) {}

  /**
   * 初始化 Python 基礎 Subject 和 9 個 Categories
   */
  async initializePythonBasic() {
    console.log('🚀 Starting Python Basic initialization...');

    // 1. 創建 Python 基礎 Subject
    const pythonBasic = await this.subjectModel.findOneAndUpdate(
      { slug: 'python-basic' },
      {
        name: 'Python 基礎',
        slug: 'python-basic',
        description: 'TQC Python 基礎程式設計認證練習',
        language: 'python',
        icon: '🐍',
        color: '#3B82F6',
        isActive: true,
      },
      { upsert: true, new: true },
    );

    console.log(`✅ Subject created: ${pythonBasic.name} (${pythonBasic._id})`);

    // 2. 創建 9 個 Categories
    const categories = [
      { slug: 'category1', name: '第1類：基本程式設計', order: 1 },
      { slug: 'category2', name: '第2類：選擇敘述', order: 2 },
      { slug: 'category3', name: '第3類：迴圈敘述', order: 3 },
      { slug: 'category4', name: '第4類：進階控制流程', order: 4 },
      { slug: 'category5', name: '第5類：函式(Function)', order: 5 },
      { slug: 'category6', name: '第6類：串列(List)的運作', order: 6 },
      { slug: 'category7', name: '第7類：數組、集合、字典', order: 7 },
      { slug: 'category8', name: '第8類：字串(String)的運作', order: 8 },
      { slug: 'category9', name: '第9類：檔案與異常處理', order: 9 },
    ];

    for (const cat of categories) {
      const category = await this.categoryModel.findOneAndUpdate(
        { subjectId: pythonBasic._id, slug: cat.slug },
        {
          subjectId: pythonBasic._id,
          name: cat.name,
          slug: cat.slug,
          order: cat.order,
        },
        { upsert: true, new: true },
      );

      console.log(`  ✅ Category: ${category.name}`);
    }

    console.log('🎉 Python Basic initialization completed!');
    return { subject: pythonBasic, categoriesCount: categories.length };
  }

  /**
   * 遷移現有題目：添加 subjectId 和 categoryId
   */
  async migrateExistingQuestions() {
    console.log('🚀 Starting question migration...');

    const pythonBasic = await this.subjectModel.findOne({ slug: 'python-basic' });
    if (!pythonBasic) {
      throw new Error('Python Basic subject not found. Run initialization first.');
    }

    const categories = await this.categoryModel.find({ subjectId: pythonBasic._id });
    const categoryMap = new Map<string, Types.ObjectId>();
    
    categories.forEach(cat => {
      categoryMap.set(cat.slug, cat._id as Types.ObjectId);
    });

    // 更新所有現有題目
    const questions = await this.questionModel.find({ subjectId: { $exists: false } });
    
    let updated = 0;
    for (const question of questions) {
      const categoryId = categoryMap.get(question.category);
      
      if (categoryId) {
        question.subjectId = pythonBasic._id as Types.ObjectId;
        question.categoryId = categoryId;
        await question.save();
        updated++;
      }
    }

    console.log(`✅ Migrated ${updated} questions`);
    return { updated };
  }

  /**
   * 創建其他科目 placeholders
   */
  async createOtherSubjects() {
    console.log('🚀 Creating other subject placeholders...');

    const subjects = [
      {
        slug: 'python-ai',
        name: 'Python AI/機器學習',
        description: 'Python 人工智慧與機器學習實戰',
        language: 'python',
        icon: '🤖',
        color: '#8B5CF6',
      },
      {
        slug: 'python-crawler',
        name: 'Python 爬蟲',
        description: 'Python 網路爬蟲技術與實作',
        language: 'python',
        icon: '🕷️',
        color: '#10B981',
      },
      {
        slug: 'javascript',
        name: 'JavaScript 面試題',
        description: 'JavaScript 核心概念與面試題庫',
        language: 'javascript',
        icon: '⚡',
        color: '#F59E0B',
      },
    ];

    for (const subj of subjects) {
      await this.subjectModel.findOneAndUpdate(
        { slug: subj.slug },
        { ...subj, isActive: false }, // 標記為未啟用
        { upsert: true },
      );

      console.log(`  ✅ Subject placeholder: ${subj.name}`);
    }

    console.log('🎉 Subject placeholders created!');
  }
}
