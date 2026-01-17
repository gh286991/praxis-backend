import { QuestionData } from './types';

// Prompt Versions
export const PROMPT_VERSIONS = {
  GENERATE_QUESTION: '1.0.0',
  GENERATE_HINT: '1.0.0',
  CHECK_SEMANTICS: '1.0.0',
};

export const GENERATE_QUESTION_PROMPT = (topic: string) => ({
  version: PROMPT_VERSIONS.GENERATE_QUESTION,
  text: `
You are a Python exam question generator for TQC (Techficiency Quota Certification) - Python General Purpose Programming.
Generate a Python coding exercise focusing on TQC Category: "${topic}".

TQC Python Categories reference:
1. Basic Programming Design (Variables, Expressions, Input/Output)
2. Selection Statements (if, else, elif)
3. Repetition Structures (for, while loops)
4. Complex Data Structures (Lists, Tuples, Dictionaries, Sets)
5. Functions (Definition, Parameters, Return values)
6. List Comprehension and String Operations
7. Error Handling and Files (try-except, file I/O)
8. Standard Libraries and Modules
9. Object-Oriented Programming (Classes, Objects)

The output MUST be a valid JSON object with the following structure:
{
  "title": "Question Title",
  "description": "Problem description. Include specific input/output format requirements (e.g. 'Print the result to 2 decimal places').",
  "sampleInput": "Input example for user",
  "sampleOutput": "Expected output example matching sampleInput. Ensure this is EXACTLY what the code should print.",
  "testCases": [
      { "input": "input1", "output": "output1" },
      { "input": "input2", "output": "output2" }
  ]
}

IMPORTANT RULES:
1. expectedOutput should countain EXACTLY what is printed to stdout.
2. If the user needs to print a prompt like 'Enter number:', include that in the output OR specify in description that prompts are not required. 
3. PREFER questions where the user just reads input and prints output without extra prompt text (like "Input a number: "), to make validation easier.
4. Ensure the description is in Traditional Chinese (繁體中文).
5. Do not include markdown formatting (like \`\`\`json). Just return the raw JSON string.
`
});

export const GENERATE_HINT_PROMPT = (question: QuestionData, userCode: string) => ({
  version: PROMPT_VERSIONS.GENERATE_HINT,
  text: `
You are a helpful Python tutor assisting a student with a coding problem.

The Problem:
Title: ${question.title}
Description: ${question.description}

The Student's Current Code:
${userCode}

The student is stuck and asking for a hint.
Please provide a response in Traditional Chinese (繁體中文) strictly following this format:

### 🧠 解題思路
(Briefly explain the logical steps to solve this problem. Use bullet points. Keep it under 3 lines.)

### 🔑 關鍵語法
(List key Python functions e.g., \`input()\`, \`int()\`, \`f-string\`. No explanations needed.)

### 💡 提示
(Specific, short advice based on their current code. Max 2 sentences.)

CRITICAL RULES:
1. DO NOT reveal the complete solution code.
2. KEEP IT CONCISE. The user wants quick hints, not long explanations.
3. Use standard markdown for formatting (bullet points, backticks for code).
`
});

export const CHECK_SEMANTICS_PROMPT = (question: QuestionData, userCode: string) => ({
  version: PROMPT_VERSIONS.CHECK_SEMANTICS,
  text: `
You are a strict Python code reviewer.

Problem:
${question.title}
${question.description}

User Code:
${userCode}

Task:
Check if the code LOGICALLY solves the problem and adheres to specific constraints (e.g., "must use a for loop", "must use list comprehension").
Do NOT strictly check the output (we have test cases for that). Focus on the METHOD and LOGIC.

Output JSON only:
{
  "passed": boolean, // true if logic is sound and meets constraints
  "feedback": "string" // Short, constructive feedback in Traditional Chinese (繁體中文). If passed, say "符合題意要求". If failed, explain why.
}
`
});
