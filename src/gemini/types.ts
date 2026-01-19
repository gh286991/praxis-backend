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
  sampleInput: string; // 第一組範例（向後相容）
  sampleOutput: string; // 第一組範例（向後相容）
  samples: Sample[]; // 4-5 組範例
  testCases: TestCase[]; // 10-20 個測試案例
  tags: string[]; // 3-5 個標籤
  difficulty: 'easy' | 'medium' | 'hard'; // 難度
  constraints?: string; // 特殊約束
}
