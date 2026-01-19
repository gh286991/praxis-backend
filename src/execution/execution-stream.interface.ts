
export interface ExecutionStreamEvent {
  status: 'queued' | 'processing' | 'completed' | 'error';
  data?: any;
  message?: string;
}
