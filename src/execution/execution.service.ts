import { Injectable, OnModuleInit } from '@nestjs/common';
import { Observable, Subject } from 'rxjs'; // Stream support
import axios from 'axios';

@Injectable()
export class ExecutionService implements OnModuleInit {
  private queue: any;

  async onModuleInit() {
    try {
      const { default: PQueue } = await import('p-queue');
      // Limit concurrency to 1 to avoid burst issues with Piston, keep rate at 5/sec
      this.queue = new PQueue({
        interval: 1000,
        intervalCap: 5,
        concurrency: 1,
      });
      console.log(
        '[ExecutionService] Rate limiting queue initialized (1 concurrent, 5 req/sec)',
      );
    } catch (e) {
      console.error('[ExecutionService] Failed to load p-queue', e);
      this.queue = { add: (fn: any) => fn() };
    }
  }

  // Private helper to execute on Piston (No Queueing)
  private async executePiston(
    code: string,
    input: string = '',
    fileAssets?: Record<string, string>,
    retryCount: number = 0,
    timeout: number = 5000, // Default 5 seconds for user code
  ): Promise<{ output: string; error?: string }> {
    const pistonEnvVar = process.env.PISTON_URL;
    let pistonEndpoint = 'https://emkc.org/api/v2/piston/execute';

    if (pistonEnvVar) {
      if (pistonEnvVar.endsWith('/execute')) {
        pistonEndpoint = pistonEnvVar;
      } else {
        pistonEndpoint = `${pistonEnvVar.replace(/\/$/, '')}/api/v2/execute`;
      }
    }

    try {
      const files = [{ content: code }];
      if (fileAssets) {
        for (const [name, content] of Object.entries(fileAssets)) {
          files.push({ name, content } as any);
        }
      }

      const response = await axios.post(pistonEndpoint, {
        language: 'python',
        version: '3.10.0',
        files: files,
        stdin: input,
        run_timeout: timeout,
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
      if (err.response && err.response.status === 429) {
        if (retryCount < 3) {
          const delay = 1000 * Math.pow(2, retryCount); // 1s, 2s, 4s
          console.warn(
            `[ExecutionService] 429 from Piston. Retrying in ${delay}ms (Attempt ${retryCount + 1}/3)...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.executePiston(code, input, fileAssets, retryCount + 1);
        }

        return {
          output: '',
          error: 'Error: Too many requests, please try again later.',
        };
      }
      throw err;
    }
  }

  async executePython(
    code: string,
    input: string = '',
    fileAssets?: Record<string, string>,
  ): Promise<{ output: string; error?: string }> {
    try {
      if (!this.queue) this.queue = { add: (fn: any) => fn() };

      return await this.queue.add(async () => {
        return await this.executePiston(code, input, fileAssets, 0, 5000);
      });
    } catch (err: any) {
      console.error('Execution error:', err.message);
      return { output: '', error: `Execution Error: ${err.message}` };
    }
  }

  // For question generation - use longer timeout (8 seconds)
  async executePythonForGeneration(
    code: string,
    input: string = '',
    fileAssets?: Record<string, string>,
  ): Promise<{ output: string; error?: string }> {
    try {
      if (!this.queue) this.queue = { add: (fn: any) => fn() };

      return await this.queue.add(async () => {
        return await this.executePiston(code, input, fileAssets, 0, 8000);
      });
    } catch (err: any) {
      console.error('Execution error:', err.message);
      return { output: '', error: `Execution Error: ${err.message}` };
    }
  }

  async executePythonStream(
    code: string,
    input: string = '',
    fileAssets?: Record<string, string>,
  ): Promise<Observable<any>> {
    const subject = new Subject<any>();

    subject.next({ status: 'queued', message: 'Request queued' });

    this.queue
      .add(async () => {
        try {
          subject.next({ status: 'processing', message: 'Processing code...' });

          const result = await this.executePiston(code, input, fileAssets);

          subject.next({
            status: 'completed',
            data: {
              output: result.output,
              error: result.error,
              // Compatibility with previous stream format which expected 'code' field?
              // Logic above returns output/error nicely.
            },
          });
          subject.complete();
        } catch (error: any) {
          console.error('Stream Execution failed', error.message);
          subject.next({
            status: 'error',
            message: error.message || 'Unknown error',
          });
          subject.complete();
        }
      })
      .catch((err: any) => {
        subject.error(err);
      });

    return subject.asObservable();
  }

  async evaluateSubmissionStream(
    code: string,
    testCases: {
      input: string;
      output: string;
      fileAssets?: Record<string, string>;
    }[],
    fileAssets?: Record<string, string>,
  ): Promise<Observable<any>> {
    const subject = new Subject<any>();
    const total = testCases.length;

    subject.next({ status: 'queued', message: 'Submission queued...' });

    this.queue
      .add(async () => {
        let allPassed = true;
        const results: any[] = [];

        try {
          for (let i = 0; i < total; i++) {
            const testCase = testCases[i];
            subject.next({
              status: 'processing',
              message: `Test Case ${i + 1}/${total}: Running...`,
            });

            // Priority 1: Use testCase's own fileAssets if available
            // Priority 2: Use question's global fileAssets as fallback
            // Priority 3: Parse input string for file definition (legacy support)
            let currentInput = testCase.input;
            let currentFileAssets = { ...fileAssets };

            if (
              testCase.fileAssets &&
              Object.keys(testCase.fileAssets).length > 0
            ) {
              // Test case has its own fileAssets, use them (merge with question's global ones)
              currentFileAssets = {
                ...currentFileAssets,
                ...testCase.fileAssets,
              };
              // Clear stdin since file content is provided via fileAssets
              currentInput = '';
            } else if (fileAssets) {
              // Legacy support: Check if input follows "filename: content" pattern
              for (const fileName of Object.keys(fileAssets)) {
                if (currentInput.startsWith(fileName + ':')) {
                  const fileContent = currentInput
                    .substring(fileName.length + 1)
                    .trim();
                  currentFileAssets[fileName] = fileContent;
                  currentInput = ''; // Clear input since it's file content, not stdin
                }
              }
            }

            // Execute WITHOUT queueing (we are already in the queue)
            const { output, error } = await this.executePiston(
              code,
              currentInput,
              currentFileAssets,
            );

            const actualOutputTrimmed = output.trim();
            const expectedOutputTrimmed = testCase.output.trim();
            let passed =
              !error && actualOutputTrimmed === expectedOutputTrimmed;

            if (!passed && !error) {
              // Floating point tolerance attempt
              const numActual = parseFloat(actualOutputTrimmed);
              const numExpected = parseFloat(expectedOutputTrimmed);
              if (!isNaN(numActual) && !isNaN(numExpected)) {
                if (Math.abs(numActual - numExpected) <= 0.02) {
                  passed = true;
                }
              }
            }

            if (!passed) allPassed = false;

            const testResult = {
              input: testCase.input,
              expected: testCase.output, // Send ORIGINAL output to frontend for display
              actual: output, // Send ORIGINAL actual output too!
              error: error || null,
              passed,
            };

            results.push(testResult);

            // 🔥 IMMEDIATELY send this test case result
            subject.next({
              status: 'test_case_completed',
              data: {
                testIndex: i,
                testCase: testResult,
                totalTests: total,
              },
            });
          }

          // Send final summary
          subject.next({
            status: 'completed',
            data: {
              passed: allPassed,
              results: results,
            },
          });
          subject.complete();
        } catch (err: any) {
          subject.next({ status: 'error', message: err.message });
          subject.complete();
        }
      })
      .catch((err: any) => subject.error(err));

    return subject.asObservable();
  }

  async evaluateSubmission(
    code: string,
    testCases: {
      input: string;
      output: string;
      fileAssets?: Record<string, string>;
    }[],
    fileAssets?: Record<string, string>,
  ): Promise<{ passed: boolean; results: any[] }> {
    // Reuse logic? Or keep separate?
    // For existing calls (if any), we need non-streaming return.
    // But we can just duplicate logic or wrap stream?
    // Since evaluateSubmission calls executePython (which queues),
    // it is safe to call from controller. BUT submitting multiple items
    // means multiple queue entries.
    // Better to Refactor evaluateSubmission to ALSO use executePiston inside ONE queue task?
    // Yes.

    if (!this.queue) this.queue = { add: (fn: any) => fn() };

    return await this.queue.add(async () => {
      const results: any[] = [];
      let allPassed = true;

      for (const testCase of testCases) {
        // Priority 1: Use testCase's own fileAssets if available
        // Priority 2: Use question's global fileAssets as fallback
        // Priority 3: Parse input string for file definition (legacy support)
        let currentInput = testCase.input;
        let currentFileAssets = { ...fileAssets };

        if (
          testCase.fileAssets &&
          Object.keys(testCase.fileAssets).length > 0
        ) {
          // Test case has its own fileAssets, use them (merge with question's global ones)
          currentFileAssets = { ...currentFileAssets, ...testCase.fileAssets };
          // Clear stdin since file content is provided via fileAssets
          currentInput = '';
        } else if (fileAssets) {
          // Legacy support: Check if input follows "filename: content" pattern
          for (const fileName of Object.keys(fileAssets)) {
            if (currentInput.startsWith(fileName + ':')) {
              const fileContent = currentInput
                .substring(fileName.length + 1)
                .trim();
              currentFileAssets[fileName] = fileContent;
            }
          }
        }

        const { output, error } = await this.executePiston(
          code,
          currentInput,
          currentFileAssets,
        );
        // ... same comparison logic ...
        const actualOutputTrimmed = output.trim();
        const expectedOutputTrimmed = testCase.output.trim();
        let passed = !error && actualOutputTrimmed === expectedOutputTrimmed;

        if (!passed && !error) {
          const numActual = parseFloat(actualOutputTrimmed);
          const numExpected = parseFloat(expectedOutputTrimmed);
          if (!isNaN(numActual) && !isNaN(numExpected)) {
            if (Math.abs(numActual - numExpected) <= 0.02) {
              passed = true;
            }
          }
        }

        if (!passed) allPassed = false;
        results.push({
          input: testCase.input,
          expected: testCase.output, // Send ORIGINAL output for display
          actual: output, // Send ORIGINAL actual output too!
          error,
          passed,
        });
      }
      return { passed: allPassed, results };
    });
  }
}
