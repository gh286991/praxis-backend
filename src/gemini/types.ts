export interface Sample {
  input: string;
  output: string;
  explanation?: string;
}

export interface TestCase {
  input: string;
  output: string;
  type?: 'normal' | 'edge' | 'corner';
  description?: string;
}

export interface QuestionData {
  title: string;
  description: string;
  sampleInput: string;
  sampleOutput: string;
  hint?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  constraints?: string;
  tags: string[]; // Slugs or ObjectIds
  samples?: Sample[]; // Using Sample interface for full type support
  testCases?: { input: string; output: string }[];
  referenceCode?: string; // New field for self-verification
  fileAssets?: Record<string, string>; // Virtual files for I/O questions
}

export interface GenerationUpdate {
  status: 'progress' | 'success' | 'error';
  message: string;
  data?: QuestionData;
}
