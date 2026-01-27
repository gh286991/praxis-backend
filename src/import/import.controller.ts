import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';


interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('mock-exam')
  @UseInterceptors(FileInterceptor('file'))
  async importMockExam(
    @UploadedFile() file: MulterFile,
    @Body('subjectId') subjectId?: string,
  ) {
    console.log('Received file upload request');
    if (subjectId) {
      console.log(`Target Subject ID: ${subjectId}`);
    }

    if (!file) {
      throw new BadRequestException('File is required');
    }

    console.log(
      `File received: ${file.originalname}, size: ${file.size}, mimetype: ${file.mimetype}`,
    );

    // Basic validation
    if (!file.originalname.match(/\.(zip|json)$/)) {
      throw new BadRequestException('Only .zip or .json files are supported');
    }

    const result = await this.importService.processImport(file, subjectId);
    return {
      success: true,
      data: result,
    };
  }
}
