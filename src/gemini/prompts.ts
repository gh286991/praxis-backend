import { QuestionData } from './types';

// Prompt Versions
export const PROMPT_VERSIONS = {
  GENERATE_QUESTION: '2.1.0', // Updated with Category-Specific Guidelines
  GENERATE_LOGIC_HINT: '1.0.0',
  GENERATE_CODE_HINT: '1.0.0',
  CHECK_SEMANTICS: '1.0.0',
  FIX_QUESTION: '1.0.0',
  CHAT_WITH_TUTOR: '1.0.0',
};

export const GENERATE_QUESTION_PROMPT = (
  topic: string,
  availableTags: string = '',
  guidelines: string = '',
) => ({
  version: PROMPT_VERSIONS.GENERATE_QUESTION,
  text: `
You are a Python exam question generator for TQC (Techficiency Quota Certification) - Python General Purpose Programming.
Generate a Python coding exercise focusing on TQC Category: "${topic}".

IMPORTANT: Output MUST be a valid JSON object with the following structure:

{
  "title": "Question Title (繁體中文)",
  "description": "詳細題目描述（繁體中文）。必須包含：
    - 問題背景
    - 輸入格式說明
    - 輸出格式說明（如：保留小數點後幾位）
    - 任何特殊約束",
  
  "samples": [
    {
      "input": "範例輸入1",
      "output": "(系統自動生成)",
      "explanation": "簡短說明（可選）"
    },
    {
      "input": "範例輸入2",
      "output": "(系統自動生成)"
    }
    // ... 總共 4-5 組範例，涵蓋不同情況
    // NOTE: output 欄位將由系統執行 referenceCode 自動填入
  ],
    
  "tags": ["tag-slug-1", "tag-slug-2"],  // MUST be selected from the Available Tags list below (return SLUGS only)
  "difficulty": "easy",  // or "medium" or "hard"
  "constraints": "特殊約束說明（如果有，否則為 null）",
  "referenceCode": "import sys...", // A fully working Python solution code
  "fileAssets": [ // Optional: Virtual files for file I/O questions
    { "filename": "data.txt", "content": "10,20,30\\n40,50,60" },
    { "filename": "config.json", "content": "{\\"key\\": \\"value\\"}" }
  ]
}

Available Tags (Select 3-5 that match the question):
${availableTags}

${
  guidelines
    ? `CRITICAL: CATEGORY-SPECIFIC DESIGN GUIDELINES (MUST FOLLOW):

${guidelines}
`
    : ''
}

CRITICAL requirements for Tags:
- You MUST ONLY use tags from the "Available Tags" list above.
- Return the "slug" of the tag (e.g., "list-comprehension", not "列表推導式").
- Do NOT invent new tags.

CRITICAL REQUIREMENTS:

1. **範例 (samples)** - 必須產生 4-5 組:
   - 每組範例展示不同的測試情況
   - 涵蓋典型案例、邊界案例、特殊案例
   - **samples.output 由系統自動產生**（請填入 placeholder 即可）
   - explanation 可選，但建議簡短說明
   - **檔案 I/O 題目**: samples.input 必須使用 "filename: content" 格式
     - 例如: "data.txt: 10,20,30\\n40,50,60"
     - 這樣系統才能正確解析並建立虛擬檔案


2. **標籤 (tags)** - 必須產生 3-5 個:
   - 請從上方提供的 Available Tags 列表中選擇最合適的標籤 Slug。
   - 確保涵蓋概念、資料結構與演算法層面。

3. **難度 (difficulty)**:
   - "easy": 基本語法，單一概念，直觀邏輯
   - "medium": 多個概念結合，需要思考步驟
   - "hard": 複雜邏輯，需要演算法或優化

4. **檔案 I/O (File Operations)**:
   - If the topic involves "Files" or "I/O", you MUST provide \`fileAssets\`.
   - \`fileAssets\` is a dictionary where keys are filenames and values are the file content.
   - The problem description should explicitly mention the filenames to be read.
   - The \`referenceCode\` should read from these files.
   - **CRITICAL**: The \`referenceCode\` (and student code) MUST **NOT** attempt to create the file from \`stdin\` or \`input()\`.
   - Assume the file **ALREADY EXISTS** on the disk. The system will create it for you based on \`fileAssets\`.
   - Do not write wrapper code to simulate file creation. Just open the file and process it.
   - Example: \`with open('data.txt', 'r') as f: ...\` is all you need.

6. **向後相容** - 自動設定:
   - sampleInput 設為 samples[0].input
   - sampleOutput 設為 samples[0].output

7. **輸出格式要求**:
   - 輸出必須完全符合預期格式
   - 如需保留小數，明確說明位數
   - 避免要求額外的提示文字（如「請輸入：」）
    - 避免要求額外的提示文字（如「請輸入：」）
    - 優先設計「讀取輸入 → 計算 → 輸出結果」的題目

  9. **健壯性與錯誤處理 (Robustness)**:
     - **隱藏測試條件**：題目描述中**不需要**特別提及錯誤處理（讓學生自己思考應對）。
     - **參考解答必須實作 (try-except)**：\`referenceCode\` 必須使用 \`try-except\` 區塊來捕捉 \`ValueError\` 等錯誤，並輸出簡短錯誤訊息（例如 "error"）。
     - 這樣當測試腳本產生無效輸入時，系統能產生對應的輸出作為測試標準。

  10. **參考解答 (referenceCode)**:
   - 必須提供一個完整的、正確的 Python 程式碼
   - **必須實作錯誤處理**：針對上述的健壯性要求，使用 try-except 處理非預期輸入。
   - 必須能正確解決問題並通過所有範例 (Samples)
   - 使用標準輸入 (input()) 和標準輸出 (print())
   - 不需要過度複雜，但必須正確
   - *DO NOT* include markdown backticks around the code string.


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

DO NOT include markdown code blocks. Return pure JSON only.
`,
});

export const GENERATE_INPUT_SCRIPT_PROMPT = (question: QuestionData) => ({
  version: '1.1.0',
  text: `
You are a QA Engineer responsible for generating test inputs for a Python programming problem.

Problem:
Title: ${question.title}
Description: ${question.description}

Your Task:
Write a Python script that, when executed, prints a list of test inputs to standard output (stdout).
The script MUST generate 10-20 diverse test cases, covering:
1. Normal cases (Typical inputs)
2. Edge cases (Min/Max values, Empty inputs)
3. Corner cases (Special characters, specific combinations)
4. **Invalid/Exceptional cases (Robustness Tests)**:
   - **Type Mismatch**: If expecting Integer, generate strings like "abc", "xyz", "12.5" (float), or mixed "12a".
   - **Empty/Whitespace**: Generate empty input "" or purely whitespace "   ".
   - **Format Errors**: If expecting comma-separated, generate space-separated or missing delimiters.
   - *Goal*: Verify if the user's code implements the required \`try-except\` block (e.g. prints "error" instead of crashing).

Output Format Requirements:
- The script should print a valid JSON array of strings to stdout.
- Each string in the array represents the full input content for one test case.
- For multi-line inputs, use standard newline characters (\\n).
- **File I/O**: If the problem involves reading files, prefix the file content with the filename and a colon, e.g., "data.txt: content line 1\\nline 2". 
  - If the problem reads from "data.txt", your input string should look like: "data.txt: 10,20,30"
  - If multiple files are needed, separate them with a specific delimiter (but usually one file is enough).

Script Requirements:
- The script must be self-contained (no external dependencies).
- It should use \`json.dumps()\` to print the final array.
- DO NOT print anything else to stdout (no debug logs).

Example Output of the generated script:
["5", "10", "0", "-1", "999999"]

OR for File I/O:
["data.txt: 10\\n20", "data.txt: 0\\n0", "data.txt: -5\\n-5"]

RETURN ONLY THE PYTHON SCRIPT CONTENT. NO MARKDOWN.
`,
});

export const GENERATE_LOGIC_HINT_PROMPT = (
  question: QuestionData,
  userCode: string,
) => ({
  version: PROMPT_VERSIONS.GENERATE_LOGIC_HINT,
  text: `
You are a patient Python assistant. The user hasn't typed anything yet or is stuck at the beginning.
Goal: Provide a high-level "Comment-based Solution Plan" (解題流程註解) to help them start.

Problem:
${question.title}
${question.description}

Requirement:
1. Output ONLY a block of Python comments that outlines the steps to solve the problem.
2. DO NOT write the actual code logic (no variables, no loops yet). Just the plan.
3. Use strict Traditional Chinese (繁體中文).
4. Format it so the user can copy-paste it into their editor as a starting framework.

Example Output:
# 解題流程：
# 1. 讀取使用者輸入的整數 N
# 2. 使用 for 迴圈遍歷 1 到 N
# 3. 判斷數字是否為偶數...
`,
});

export const GENERATE_CODE_HINT_PROMPT = (
  question: QuestionData,
  userCode: string,
) => ({
  version: PROMPT_VERSIONS.GENERATE_CODE_HINT,
  text: `
You are a helpful Python tutor assisting a student with a coding problem.

The Problem:
Title: ${question.title}
Description: ${question.description}

The Student's Current Code:
${userCode}

The student is stuck and asking for specific syntax help or the next step.
Please provide a response in Traditional Chinese (繁體中文) strictly following this format:

### 🧠 解題思路
(Briefly explain the logical steps to solve this problem. Use bullet points. Keep it under 3 lines.)

### 🔑 關鍵語法
(List 3-5 key Python keywords/functions. MUST use a Markdown bulleted list. Put each item on its own line. Do NOT use inline commas.)
- \`input()\`
- \`print()\`

### 💡 建議程式碼片段
(Provide a small snippet of code that they should type next. NOT the whole solution.)

CRITICAL RULES:
1. DO NOT reveal the COMPLETE solution code. Just the next step.
2. KEEP IT CONCISE.
3. Use standard markdown.
`,
});

export const CHECK_SEMANTICS_PROMPT = (
  question: QuestionData,
  userCode: string,
) => ({
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
`,
});

export const FIX_QUESTION_PROMPT = (
  originalQuestion: QuestionData,
  failureReport: string,
) => ({
  version: PROMPT_VERSIONS.FIX_QUESTION,
  text: `
You are a Python exam question repair expert.
Your goal is to fix a previously generated question that failed automated verification.

=== The Failed Question ===
${JSON.stringify(originalQuestion, null, 2)}

=== The Failure Report ===
${failureReport}

=== Your Task ===
1. **Analyze the Failure Report**.
   - Look at the "Actual Output" (produced by the Reference Code) and the "Expected Output" (from the Test Case).
   - **CRITICAL**: In 95% of cases, the **Reference Code is CORRECT** and the **Test Case Expected Output is WRONG** (hallucinated).
   - Unless the Reference Code clearly violates the problem description, **you should update the Test Case "output" to match the "Actual Output"**.
   - **CHECK INPUT VALIDITY**: If the "Actual Output" is weird (e.g., "Not Found" when it should be found, or empty), check if the Test Case \`input\` string **missing lines**? (e.g., Code expects N lines + Query, but Input only has N lines). If so, **FIX the \`input\` string**.
   - **CHECK FILE I/O INPUTS**: If the question uses files and the Test Case implies specific file content (e.g. empty file), the \`input\` MUST use the format: \`filename: content\`. If \`input\` contains "N/A" or generic text, **REPLACE IT** with the specific file content override (e.g., \`data.txt: \` for empty file).

2. **Produce a PARTIAL JSON object (Optimization)**.
   - **DO NOT** return the full JSON. Only return the fields that need to be fixed (e.g., "testCases" or "referenceCode").
   - If you are fixing "testCases", return: { "testCases": [ ... corrected cases ... ] }
   - If you are fixing "referenceCode", return: { "referenceCode": "..." }
   - You can return both if needed.
   - **OMIT** "title", "description", "tags" etc. if they are unchanged.

3. **Output Format**:
   - Return ONLY the raw valid partial JSON string.
   - Do not include markdown formatting like \`\`\`json.

FIXED PARTIAL JSON:
`,
});
export const CHAT_WITH_TUTOR_PROMPT = (
  question: QuestionData,
  userCode: string,
  chatHistory: { role: 'user' | 'model'; message: string }[],
  userMessage: string,
) => {
  const historyText = chatHistory
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Tutor'}: ${msg.message}`)
    .join('\n');

  return {
    version: PROMPT_VERSIONS.CHAT_WITH_TUTOR,
    text: `
You are a **Professional and Patient Python Tutor (AI 程式導師)** for TQC exam preparation.
Your goal is to guide the user to solve the problem by themselves, while providing clear syntax help when needed.
**Persona**: Explain concepts like a helpful teacher. Be encouraging but focused. Use clear, easy-to-understand language.

Problem Context:
Title: ${question.title}
Description:
${question.description}

User's Current Code:
\`\`\`python
${userCode}
\`\`\`

Conversation History:
${historyText}

User's New Question:
"${userMessage}"

Guidelines:
1. **Check relevance.**
   - The user's input should be related to programming, the current problem, or the ongoing conversation.
   - **Allow conversational clarifications** (e.g., "I understand", "Okay", "What happens next?", "I got the matrix").
   - **Only refuse if clearly off-topic** (e.g., asking about History, Physics, or unrelated general chat).
   - If off-topic, say: "請專注於目前的程式題目 (Please focus on the current programming problem)."
2. **Context Awareness**:
   - The user's code is provided in the **User's Current Code** section above.
   - **DO NOT ask the user to provide their code.** Read it from the context.
3. **Be extremely concise.** Do not waste words.
4. **Length Limit**: Your response MUST be under **350 characters** (approx. 100-150 Chinese words). Focus on the most important point.
5. If the user asks for syntax, **provide the code snippet and briefly explain it**.
6. If the user asks for a hint or approach, **provide a numbered 'Solution TODO List'** (Step 1, Step 2...) that breaks down the logic.
7. If the user's code has an error, **point it out, explain why it's wrong, and show the fix**.
8. Do not provide full solution code *unless* the user explicitly asks for the whole thing.
9. Use Traditional Chinese (繁體中文).
10. Use markdown for code formatting.

Your Response:
`,
  };
};
