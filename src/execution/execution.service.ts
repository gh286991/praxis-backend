import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import * as os from 'os';

@Injectable()
export class ExecutionService {
  async executePython(code: string, input: string = ''): Promise<{ output: string; error?: string }> {
    const tmpDir = os.tmpdir();
    const fileName = `script_${Date.now()}_${Math.random().toString(36).substring(7)}.py`;
    const filePath = path.join(tmpDir, fileName);

    try {
      await fs.writeFile(filePath, code);

      return new Promise((resolve) => {
        const pythonProcess = spawn('python3', [filePath]);
        
        let stdout = '';
        let stderr = '';

        if (input) {
          pythonProcess.stdin.write(input);
          pythonProcess.stdin.end();
        }

        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        pythonProcess.on('close', async (code) => {
          // Cleanup
          try {
            await fs.unlink(filePath);
          } catch (e) {
            console.error('Error deleting tmp file:', e);
          }

          if (code !== 0) {
            resolve({ output: stdout, error: stderr || `Process exited with code ${code}` });
          } else {
            resolve({ output: stdout });
          }
        });

        // Timeout safety
        setTimeout(() => {
            pythonProcess.kill();
            resolve({ output: stdout, error: 'Execution Timed Out' });
        }, 5000); // 5s timeout
      });
    } catch (err) {
      return { output: '', error: err.message };
    }
  }
}
