import { Controller, Post, Body } from '@nestjs/common';
import { ExecutionService } from './execution.service';

@Controller('execution')
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Post('run')
  async runCode(@Body() body: { code: string; input?: string }) {
    return this.executionService.executePython(body.code, body.input);
  }
}
