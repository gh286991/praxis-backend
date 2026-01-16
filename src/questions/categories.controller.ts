import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Category } from './schemas/category.schema';

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

  @Post()
  async create(@Body() categoryData: Partial<Category>) {
    return this.categoriesService.create(categoryData);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() categoryData: Partial<Category>,
  ) {
    return this.categoriesService.update(id, categoryData);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.categoriesService.delete(id);
  }
}
