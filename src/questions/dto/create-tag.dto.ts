
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { TagCategory } from '../schemas/tag.schema';

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsEnum(TagCategory)
  @IsOptional()
  type?: TagCategory;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
