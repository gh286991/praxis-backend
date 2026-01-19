import { ExecutionService } from './src/execution/execution.service';

async function main() {
  console.log('=== Rate Limit Queue Test ===');
  console.log('Initializing ExecutionService...');

  const service = new ExecutionService();
  await service.onModuleInit();

  console.log(' firing 50 concurrent requests to Piston (Limit: 5/sec)...');
  console.log(
    'Expectation: Requests should finish in batches of 5 every second (Total ~10s)',
  );

  const startTime = Date.now();
  const tasks: Promise<void>[] = [];

  for (let i = 0; i < 50; i++) {
    tasks.push(
      (async () => {
        try {
          // Use simple code to execution
          const result = await service.executePython('print("Hello")', '');
          const elapsed = Date.now() - startTime;
          if (result.error) {
            console.log(
              `[Request ${i + 1}] Finished at ${elapsed}ms -> ERROR: ${result.error}`,
            );
          } else {
            console.log(
              `[Request ${i + 1}] Finished at ${elapsed}ms -> Output: ${result.output.trim()}`,
            );
          }
        } catch (err) {
          console.error(`[Request ${i + 1}] Failed:`, err);
        }
      })(),
    );
  }

  await Promise.all(tasks);
  console.log('=== Test Completed ===');
}

main();
