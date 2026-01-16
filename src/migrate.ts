import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MigrationService } from './questions/migration.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const migrationService = app.get(MigrationService);

  try {
    console.log('\n==============================================');
    console.log('   Database Migration Script');
    console.log('==============================================\n');

    // Step 1: Initialize Python Basic Subject and Categories
    await migrationService.initializePythonBasic();

    // Step 2: Migrate existing questions
    await migrationService.migrateExistingQuestions();

    // Step 3: Create other subject placeholders
    await migrationService.createOtherSubjects();

    console.log('\n==============================================');
    console.log('   ✅ Migration completed successfully!');
    console.log('==============================================\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
