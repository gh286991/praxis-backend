import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { Subject } from './schemas/subject.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const include = includeInactive === 'true';
    return this.subjectsService.findAll(include);
  }

  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.subjectsService.findBySlug(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() subjectData: Partial<Subject>) {
    return this.subjectsService.create(subjectData);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() subjectData: Partial<Subject>) {
    return this.subjectsService.update(id, subjectData);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.subjectsService.delete(id);
  }
}
