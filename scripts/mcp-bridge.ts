import * as http from 'http';
import { fileURLToPath } from 'url';

/**
 * MCP Bridge
 * Connects standard input/output (stdio) from an MCP client to the NestJS backend via HTTP/SSE.
 *
 * Usage:
 * ts-node scripts/mcp-bridge.ts --key <API_KEY> --port <PORT>
 */

const LOG_PREFIX = '[Bridge]';
const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = '3000';

function log(message: string) {
  console.error(`${LOG_PREFIX} ${message}`);
}

// Basic JSON-RPC Message Structure
interface JsonRpcMessage {
  jsonrpc: string;
  id?: string | number | null;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

class McpBridge {
  private apiKey: string;
  private port: string;
  private host: string = DEFAULT_HOST;
  private backendUrl: string;
  private sessionId: string | null = null;
  private postUrl: string | null = null;
  private requestQueue: string[] = [];
  private sseReq: http.ClientRequest | null = null;

  constructor() {
    // Parse args
    const args = process.argv.slice(2);
    const getArg = (name: string): string | null => {
      const idx = args.indexOf(name);
      return idx !== -1 ? args[idx + 1] : null;
    };

    this.apiKey = getArg('--key') || process.env.MCP_API_KEY || '';
    this.port = getArg('--port') || process.env.PORT || DEFAULT_PORT;
    this.backendUrl = `http://${this.host}:${this.port}`;

    if (!this.apiKey) {
      log('Warning: No API Key provided via --key or MCP_API_KEY');
    }

    log(`Starting... Target: ${this.backendUrl}`);
  }

  public start(): void {
    this.connectSSE();
    this.listenToStdin();
  }

  private sendPost(payload: string): void {
    if (!this.postUrl) {
      this.requestQueue.push(payload);
      return;
    }

    const options: http.RequestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(this.postUrl, options, (res) => {
      // We don't really care about the POST response body,
      // as the actual MCP response comes via SSE.
      // But we should consume it to free memory.
      res.resume();
    });

    req.on('error', (e) => {
      log(`POST Error: ${e.message}`);
    });

    req.write(payload);
    req.end();
  }

  private connectSSE(): void {
    const sseOptions: http.RequestOptions = {
      host: this.host,
      port: this.port,
      path: `/api/mcp/sse?key=${this.apiKey}`,
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no', // Important for proxies
      },
    };

    log('Connecting to SSE...');

    this.sseReq = http.request(sseOptions, (res) => {
      log(`SSE Connected: ${res.statusCode}`);

      if (res.statusCode !== 200) {
        log(`Failed to connect to SSE. Status: ${res.statusCode}`);
        // Read body to see error
        res.on('data', (d: Buffer) => console.error(d.toString()));
        return;
      }

      res.on('data', (chunk: Buffer) => {
        const text = chunk.toString();

        // Simple SSE Parser
        const lines = text.split('\n');
        for (const line of lines) {
          // Note: In a robust parser we'd handle accumulation of incomplete lines
          // but for MCP/NestJS usually lines are well-formed in chunks or we can
          // rely on the simple structure 'data: ...\n\n'

          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6).trim();

            // Case A: Endpoint Event (Session Handshake)
            if (dataStr.startsWith('/')) {
              log(`Received Endpoint: ${dataStr}`);
              // Construct full POST URL
              // dataStr is relative path like /api/mcp/messages?key=...&sessionId=...
              this.postUrl = `http://${this.host}:${this.port}${dataStr}`;
              const params = new URLSearchParams(dataStr.split('?')[1]);
              this.sessionId = params.get('sessionId');

              log(`Session Established: ${this.sessionId}`);

              // Flush Queue
              while (this.requestQueue.length > 0) {
                const queued = this.requestQueue.shift();
                if (queued) this.sendPost(queued);
              }
            }
            // Case B: Regular JSON-RPC Message
            else if (dataStr.startsWith('{')) {
              try {
                const json = JSON.parse(dataStr) as JsonRpcMessage;
                // Forward to Stdout for Antigravity/MCP Client
                process.stdout.write(JSON.stringify(json) + '\n');
              } catch {
                // ignore incomplete JSON
              }
            }
          }
        }
      });
    });

    this.sseReq.on('error', (e) => {
      log(`SSE Connection Error: ${e.message}`);
      process.exit(1);
    });

    this.sseReq.end();
  }

  private listenToStdin(): void {
    process.stdin.setEncoding('utf8');
    let buffer = '';

    process.stdin.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString();

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.trim()) {
          try {
            // Verify it's valid JSON (optional, but good for safety)
            JSON.parse(line);
            this.sendPost(line);
          } catch (e) {
            log(`Invalid JSON from Stdin: ${(e as Error).message}`);
          }
        }
      }
    });

    process.stdin.on('end', () => {
      log('Stdin ended. Exiting.');
      process.exit(0);
    });
  }
}

// Run
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  new McpBridge().start();
}
