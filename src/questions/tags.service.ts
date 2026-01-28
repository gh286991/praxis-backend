
import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tag } from './schemas/tag.schema';
import { CreateTagDto } from './dto/create-tag.dto';

@Injectable()
export class TagsService {
  constructor(@InjectModel(Tag.name) private tagModel: Model<Tag>) {}

  async create(createTagDto: CreateTagDto): Promise<Tag> {
    const existing = await this.tagModel.findOne({ slug: createTagDto.slug }).exec();
    if (existing) {
      // You might want to return the existing one instead of throwing
      // depending on UX, but for now throw conflict or return it.
      // Let's return existing to handle "ensure created" logic easily
      return existing;
    }
    const createdTag = new this.tagModel(createTagDto);
    return createdTag.save();
  }

  async findAll(): Promise<Tag[]> {
    return this.tagModel.find().sort({ usedCount: -1, name: 1 }).exec();
  }

  async search(query: string): Promise<Tag[]> {
    return this.tagModel.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { slug: { $regex: query, $options: 'i' } },
      ],
    }).limit(20).exec();
  }
}
