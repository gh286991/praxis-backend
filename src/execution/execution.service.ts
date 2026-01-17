import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import * as os from 'os';

@Injectable()
export class ExecutionService {
  async executePython(
    code: string,
    input: string = '',
  ): Promise<{ output: string; error?: string }> {
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
            resolve({
              output: stdout,
              error: stderr || `Process exited with code ${code}`,
            });
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
  async evaluateSubmission(
    code: string,
    testCases: { input: string; output: string }[],
  ): Promise<{ passed: boolean; results: any[] }> {
    const results: any[] = [];
    let allPassed = true;

    for (const testCase of testCases) {
      const { output, error } = await this.executePython(code, testCase.input);
      const actualOutput = output.trim();
      const expectedOutput = testCase.output.trim();

      // Compare logic: explicit match OR floating point tolerance
      let passed = !error && actualOutput === expectedOutput;

      if (!passed && !error) {
        // Try loose comparison for numbers (handling rounding differences like 0.125 -> 0.12 vs 0.13)
        const numActual = parseFloat(actualOutput);
        const numExpected = parseFloat(expectedOutput);

        if (!isNaN(numActual) && !isNaN(numExpected)) {
          // Allow a small epsilon delta (e.g. 0.02)
          if (Math.abs(numActual - numExpected) <= 0.02) {
            passed = true;
          }
        }
      }

      if (!passed) {
        allPassed = false;
      }

      results.push({
        input: testCase.input,
        expected: expectedOutput,
        actual: actualOutput,
        error: error || null,
        passed,
      });
    }

    return { passed: allPassed, results };
  }
}
