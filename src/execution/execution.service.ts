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
    // Use a project-local temp directory to ensure reliable sharing with Docker on Mac/Windows
    // Host path: ./temp
    // Container path: /app/temp (mapped via volume)
    const tmpDir = path.join(process.cwd(), 'temp');
    await fs.mkdir(tmpDir, { recursive: true });

    const fileName = `script_${Date.now()}_${Math.random().toString(36).substring(7)}.py`;
    const filePath = path.join(tmpDir, fileName);

    // Path inside the container (if using remote docker exec)
    // We mount ./temp -> /app/temp
    const containerFilePath = `/app/temp/${fileName}`;

    try {
      // 1. Write user code to a temp file on HOST
      await fs.writeFile(filePath, code);

      return new Promise((resolve) => {
        // 2. Execute code
        // Mode A: Docker Exec (if PYTHON_RUNNER_CONTAINER_NAME is set to a remote container)
        // Mode B: Local NsJail (Monolithic, if variable is empty or explicitly 'local')
        
        const runnerContainer = process.env.PYTHON_RUNNER_CONTAINER_NAME;
        const isLocalNsJail = !runnerContainer || runnerContainer === 'local';

        let command = '';
        let args: string[] = [];

        if (isLocalNsJail) {
          // Local NsJail Mode (Monolithic / Production Linux)
          // In this mode, we assume we are INSIDE the container, so filePath (local path) IS the path.
          // Unless we are doing crazy bind mounts, but usually Monolithic means "I wrote file to /app/temp/x.py, run it".
          command = 'nsjail';
          args = [
            '--config',
            '/app/nsjail.cfg',
            '--',
            '/usr/bin/python3',
            filePath, // Use local path
          ];
        } else {
          // Sidecar Docker Exec Mode (Local Dev on Mac/Windows)
          // We wrote file to ./temp/x.py (Host)
          // Docker container sees it at /app/temp/x.py (Volume mounted)
          command = 'docker';
          args = [
            'exec',
            '-i',
            runnerContainer,
            'nsjail',
            '--config',
            '/app/nsjail.cfg',
            '--',
            '/usr/local/bin/python3',
            containerFilePath, // Use container mapped path
          ];
        }

        const pythonProcess = spawn(command, args);

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
          // Cleanup temp file on host
          try {
            await fs.unlink(filePath);
          } catch (e) {
            console.error('Error deleting tmp file:', e);
          }

          if (code !== 0) {
            // Docker exit code 137 usually means OOMKilled (Out of Memory)
            // or 124 for timeout if we used 'timeout' command wrapper
            const errorMsg =
              code === 137
                ? 'Error: Memory Limit Exceeded'
                : stderr || `Process exited with code ${code}`;

            resolve({
              output: stdout,
              error: errorMsg,
            });
          } else {
            resolve({ output: stdout });
          }
        });

        // Timeout safety (Host side timeout)
        setTimeout(() => {
          pythonProcess.kill();
          // Note: killing the docker CLI client might leave the container running briefly.
          // --rm should handle cleanup eventually, but for strictness we might want to `docker kill` explicitly.
          // For this scale, client kill + --rm is usually acceptable.
          resolve({ output: stdout, error: 'Error: Execution Timed Out' });
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
