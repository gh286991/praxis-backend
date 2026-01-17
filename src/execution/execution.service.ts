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
    // Use a project-local temp directory to ensure reliable sharing with Docker
    // Host path: ./temp (or /app/temp inside container)
    // This path must be shared/accessible by spawned containers
    const tmpDir = path.join(process.cwd(), 'temp');
    await fs.mkdir(tmpDir, { recursive: true });

    const fileName = `script_${Date.now()}_${Math.random().toString(36).substring(7)}.py`;
    const filePath = path.join(tmpDir, fileName);

    try {
      // 1. Write user code to a temp file
      await fs.writeFile(filePath, code);

      return new Promise((resolve) => {
        // Execution Mode Selection:
        // - EXECUTION_MODE=nsjail: Use local nsjail (requires privileged container)
        // - EXECUTION_MODE=docker-socket: Spawn sibling container via Docker socket (default)
        // - EXECUTION_MODE=docker-exec: Exec into existing container (legacy sidecar mode)
        
        const executionMode = process.env.EXECUTION_MODE || 'docker-socket';
        const runnerContainer = process.env.PYTHON_RUNNER_CONTAINER_NAME;
        
        let command = '';
        let args: string[] = [];

        if (executionMode === 'nsjail') {
          // Local NsJail Mode (requires --privileged)
          command = 'nsjail';
          args = [
            '--config',
            '/app/nsjail.cfg',
            '--',
            '/usr/bin/python3',
            filePath,
          ];
        } else if (executionMode === 'docker-exec' && runnerContainer) {
          // Docker Exec Mode (exec into existing sidecar container)
          const containerFilePath = `/app/temp/${fileName}`;
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
            containerFilePath,
          ];
        } else {
          // Docker Socket Mode (spawn ephemeral sibling container)
          // This works without privileged mode as long as Docker socket is mounted
          // Uses resource limits via Docker instead of nsjail
          command = 'docker';
          args = [
            'run',
            '--rm',                           // Auto-remove container after execution
            '-i',                             // Interactive (for stdin)
            '--network', 'none',              // No network access (security)
            '--memory', '64m',                // Memory limit
            '--cpus', '0.5',                  // CPU limit
            '--pids-limit', '32',             // Process limit
            '--read-only',                    // Read-only filesystem
            '--tmpfs', '/tmp:size=10m',       // Writable /tmp with size limit
            '-v', `${filePath}:/code/script.py:ro`,  // Mount script as read-only
            'python:3.11-slim',               // Use official Python image
            'timeout', '5',                   // 5 second timeout
            'python3', '/code/script.py',
          ];
        }

        const pythonProcess = spawn(command, args);

        let stdout = '';
        let stderr = '';

        if (input) {
          pythonProcess.stdin.write(input);
          pythonProcess.stdin.end();
        } else {
          pythonProcess.stdin.end();
        }

        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        pythonProcess.on('close', async (exitCode) => {
          // Cleanup temp file
          try {
            await fs.unlink(filePath);
          } catch (e) {
            console.error('Error deleting tmp file:', e);
          }

          if (exitCode !== 0) {
            // Exit code 137 = OOMKilled, 124 = timeout
            let errorMsg = stderr || `Process exited with code ${exitCode}`;
            
            if (exitCode === 137) {
              errorMsg = 'Error: Memory Limit Exceeded';
            } else if (exitCode === 124) {
              errorMsg = 'Error: Execution Timed Out';
            }

            resolve({
              output: stdout,
              error: errorMsg,
            });
          } else {
            resolve({ output: stdout });
          }
        });

        pythonProcess.on('error', (err) => {
          resolve({ output: '', error: `Spawn error: ${err.message}` });
        });

        // Host-side timeout safety net
        setTimeout(() => {
          pythonProcess.kill();
          resolve({ output: stdout, error: 'Error: Execution Timed Out' });
        }, 10000); // 10s total timeout
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
