import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

@Injectable()
export class ExecutionService {
  async executePython(
    code: string,
    input: string = '',
  ): Promise<{ output: string; error?: string }> {
    // Piston API Integration
    const pistonEnvVar = process.env.PISTON_URL;
    // Default to Public API if not configured
    let pistonEndpoint = 'https://emkc.org/api/v2/piston/execute';

    if (pistonEnvVar) {
      if (pistonEnvVar.endsWith('/execute')) {
        pistonEndpoint = pistonEnvVar;
      } else {
        // Assume base URL provided, append standard v2 path
        pistonEndpoint = `${pistonEnvVar.replace(/\/$/, '')}/api/v2/execute`;
      }
    }

    console.log(`[ExecutionService] Using Piston Endpoint: ${pistonEndpoint}`);

    // Legacy/Local Modes
    const executionMode = process.env.EXECUTION_MODE;

    if (
      !pistonEnvVar &&
      (executionMode === 'nsjail' || executionMode === 'direct')
    ) {
      // ... Keep existing logic for fallback if needed, or simplify to reduce complexity?
      // Given user wants public security, we primarily push for Piston.
      // But let's keep the 'direct' mode as a dev fallback if PISTON_URL is missing.
      if (executionMode === 'direct') {
        try {
          const tmpDir = path.join(process.cwd(), 'temp');
          await fs.mkdir(tmpDir, { recursive: true });
          const fileName = `script_${Date.now()}_${Math.random().toString(36).substring(7)}.py`;
          const filePath = path.join(tmpDir, fileName);

          await fs.writeFile(filePath, code);
          return new Promise((resolve) => {
            const pythonProcess = spawn('python3', [filePath]);
            let stdout = '',
              stderr = '';
            if (input) {
              pythonProcess.stdin.write(input);
              pythonProcess.stdin.end();
            } else {
              pythonProcess.stdin.end();
            }
            pythonProcess.stdout.on('data', (d) => (stdout += d.toString()));
            pythonProcess.stderr.on('data', (d) => (stderr += d.toString()));
            pythonProcess.on('close', async (code) => {
              try {
                await fs.unlink(filePath);
              } catch {}
              if (code !== 0)
                resolve({
                  output: stdout,
                  error: stderr || `Exited with ${code}`,
                });
              else resolve({ output: stdout });
            });
            setTimeout(() => {
              pythonProcess.kill();
              resolve({ output: stdout, error: 'Timeout' });
            }, 5000);
          });
        } catch (e) {
          return { output: '', error: e.message };
        }
      }
    }

    // Default: Use Piston API
    try {
      // Use dynamically imported axios

      const axios = require('axios');

      const response = await axios.post(pistonEndpoint, {
        language: 'python',
        version: '3.10.0', // Request default python version
        files: [
          {
            content: code,
          },
        ],
        stdin: input,
        run_timeout: 5000,
        compile_timeout: 10000,
      });

      const { run } = response.data;

      if (run.signal === 'SIGKILL' || run.signal === 'SIGTERM') {
        return {
          output: run.output,
          error: 'Error: Execution Timed Out or Terminated',
        };
      }

      if (run.code !== 0) {
        return {
          output: run.output,
          error: run.stderr || `Error: Process exited with code ${run.code}`,
        };
      }

      return { output: run.output };
    } catch (err: any) {
      console.error('Piston execution error:', err.message);
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        return {
          output: '',
          error: 'Error: Execution service unavailable (Piston)',
        };
      }
      return { output: '', error: `Execution Error: ${err.message}` };
    }
  }

  // Remove unused Docker helpers if no longer needed
  // private runDockerCommand...

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
        // Try loose comparison for numbers (handling rounding differences)
        const numActual = parseFloat(actualOutput);
        const numExpected = parseFloat(expectedOutput);

        if (!isNaN(numActual) && !isNaN(numExpected)) {
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
