export class CreateTestCaseDto {
  input: string;
  output: string;
}

export class CreateQuestionDto {
  category: string;
  title: string;
  description: string;
  sampleInput: string;
  sampleOutput: string;
  testCases: CreateTestCaseDto[];
  generatedBy?: string; // 產生此題目的使用者 ID
  generatedAt?: Date; // 題目產生時間
  isAIGenerated?: boolean; // 是否為 AI 產生
}
