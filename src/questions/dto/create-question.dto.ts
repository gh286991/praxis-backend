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
}
