import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Request, Response } from 'express';
import { QuestionsService } from '../questions/questions.service';
import { ImportService } from '../import/import.service'; // Assuming this exists or will be reused
import { ConfigService } from '@nestjs/config';

@Injectable()
@Injectable()
export class McpService implements OnModuleInit {
  private readonly logger = new Logger(McpService.name);
  // Store active sessions provided by: sessionId -> { server, transport }
  private sessions = new Map<
    string,
    { server: McpServer; transport: SSEServerTransport }
  >();

  constructor(
    private readonly questionsService: QuestionsService,
    private readonly importService: ImportService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    // No global server init needed anymore
  }

  private createServerInstance() {
    const server = new McpServer({
      name: 'TQC Question Bank',
      version: '1.0.0',
    });

    // Tool: List Questions from DB
    server.tool(
      'list_questions',
      'List questions from the database, optionally filtered by category',
      {
        category: z
          .string()
          .optional()
          .describe('Category slug (e.g. "basic", "advanced")'),
        limit: z
          .number()
          .optional()
          .describe('Limit the number of questions (default 50)'),
      },
      async ({ category, limit = 50 }) => {
        this.logger.log(
          `Tool execution: list_questions (Category: ${category}, Limit: ${limit})`,
        );
        try {
          let questions;
          // Note: Since questionsService.getList returns a specific format, we might want findAll if no category
          if (category) {
            questions = await this.questionsService.getList(category);
          } else {
            questions = await this.questionsService.findAll();
          }

          // Limit results to prevent massive payloads
          const limitedQuestions = questions.slice(0, limit);
          this.logger.log(
            `Found ${questions.length} questions, returning ${limitedQuestions.length}`,
          );

          const summary = limitedQuestions
            .map((q: any) => `[${q.category}] ${q.title} (ID: ${q._id})`)
            .join('\n');
          return {
            content: [{ type: 'text', text: summary || 'No questions found.' }],
          };
        } catch (err: any) {
          this.logger.error(
            `Error listing questions: ${err.message}`,
            err.stack,
          );
          return {
            content: [
              { type: 'text', text: `Error listing questions: ${err.message}` },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool: Read Question Content
    server.tool(
      'read_question',
      'Read full details of a question by ID',
      {
        id: z.string().describe('The Question ID (MongoDB ObjectId)'),
      },
      async ({ id }) => {
        this.logger.log(`Tool execution: read_question (ID: ${id})`);
        try {
          const question = await this.questionsService.findOne(id, true);
          return {
            content: [
              { type: 'text', text: JSON.stringify(question, null, 2) },
            ],
          };
        } catch (err: any) {
          this.logger.error(`Error reading question: ${err.message}`);
          return {
            content: [
              { type: 'text', text: `Error reading question: ${err.message}` },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool: Import Question
    server.tool(
      'import_question',
      'Import a single question into the database',
      {
        data: z.string().describe('JSON string of the question data'),
        subjectId: z.string().optional().describe('Target Subject ID'),
      },
      async ({ data, subjectId }) => {
        this.logger.log(`Tool execution: import_question`);
        try {
          const json = JSON.parse(data);
          const result = await this.importService.importSingleQuestion(
            json,
            subjectId,
          );
          return {
            content: [
              {
                type: 'text',
                text: `Successfully imported question. SubjectID: ${result.subjectId}`,
              },
            ],
          };
        } catch (err: any) {
          this.logger.error(`Error importing question: ${err.message}`);
          return {
            content: [
              { type: 'text', text: `Error importing question: ${err.message}` },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool: Import Exam (File)
    server.tool(
      'import_exam',
      'Import an entire exam from a local .zip or .json file (引入考卷)',
      {
        filePath: z.string().describe('Absolute path to the .zip or .json file'),
        subjectId: z.string().optional().describe('Target Subject ID (optional)'),
      },
      async ({ filePath, subjectId }) => {
        this.logger.log(`Tool execution: import_exam (Path: ${filePath})`);
        try {
          // Dynamic import for fs/path to avoid global scope clutter or potential issues if not needed elsewhere
          const fs = await import('fs');
          const path = await import('path');

          if (!fs.existsSync(filePath)) {
            throw new Error(`File not found at path: ${filePath}`);
          }

          const stats = fs.statSync(filePath);
          const buffer = fs.readFileSync(filePath);
          const filename = path.basename(filePath);
          const ext = path.extname(filename).toLowerCase();

          // Determine mimetype
          let mimetype = 'application/octet-stream';
          if (ext === '.json') mimetype = 'application/json';
          else if (ext === '.zip') mimetype = 'application/zip';

          // Mock MulterFile
          const file = {
            originalname: filename,
            mimetype: mimetype,
            size: stats.size,
            buffer: buffer,
          };

          const result = await this.importService.processImport(file, subjectId);

          return {
            content: [
              {
                type: 'text',
                text: `Successfully imported module.\nProcessed: ${result.processed}\nSubjectID: ${result.subjectId}\nErrors: ${result.errors.length}`,
              },
            ],
          };
        } catch (err: any) {
          this.logger.error(`Error importing module: ${err.message}`);
          return {
            content: [
              { type: 'text', text: `Error importing module: ${err.message}` },
            ],
            isError: true,
          };
        }
      },
    );

    return server;
  }

  async handleSSE(req: Request, res: Response) {
    const apiKey = req.query.key || (req.headers['x-api-key'] as string);
    const transport = new SSEServerTransport(
      `/api/mcp/messages?key=${apiKey}`,
      res,
    );
    const server = this.createServerInstance();

    this.logger.log('Initializing new MCP Server session...');
    await server.connect(transport);

    // After connect, sessionId is available
    const sessionId = transport.sessionId;
    this.logger.log(`MCP Session created: ${sessionId}`);

    // Store both server and transport to retain references
    this.sessions.set(sessionId, { server, transport });

    // Implement keep-alive heartbeat (comment) every 15 seconds
    // This prevents Antigravity/Cursor from closing the connection due to inactivity
    const keepAliveInterval = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 15000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(keepAliveInterval);
      this.logger.log(`MCP Session closed: ${sessionId}`);
      this.sessions.delete(sessionId);
    });
  }

  async handleMessage(req: Request, res: Response) {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      this.logger.warn('handleMessage: Missing sessionId');
      res.status(400).send('Missing sessionId');
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`handleMessage: Session not found (ID: ${sessionId})`);
      res.status(404).send('Session not found');
      return;
    }

    this.logger.log(`Handling message for session: ${sessionId}`);
    await session.transport.handlePostMessage(req, res);
  }

  async startStdio() {
    this.logger.log('Starting MCP Stdio Server...');
    const transport = new StdioServerTransport();
    const server = this.createServerInstance();
    await server.connect(transport);
    this.logger.log('MCP Stdio Server started');
  }
}
