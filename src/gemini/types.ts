export interface QuestionData {
  title: string;
  description: string;
  sampleInput: string;
  sampleOutput: string;
  testCases: { input: string; output: string }[];
}
