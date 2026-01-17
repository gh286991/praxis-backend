import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Category } from './schemas/category.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('subject/:subjectId')
  async findBySubject(@Param('subjectId') subjectId: string) {
    return this.categoriesService.findBySubject(subjectId);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() categoryData: Partial<Category>) {
    return this.categoriesService.create(categoryData);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() categoryData: Partial<Category>,
  ) {
    return this.categoriesService.update(id, categoryData);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.categoriesService.delete(id);
  }
}
