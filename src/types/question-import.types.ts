/**
 * TypeScript Type Definitions for Question Import
 * 
 * This file defines the complete structure for importing questions via JSON.
 * Supports file-based questions with fileAssets at question, sample, and test case levels.
 * 
 * @version 2.0
 * @since 2026-01-27
 */

/**
 * Sample Input/Output Pair
 * Used for displaying example test cases to users
 */
export interface QuestionSample {
  /** Sample input data or description */
  input: string;
  
  /** Expected output for this sample */
  output: string;
  
  /** Optional explanation of the sample */
  explanation?: string;
  
  /**
   * File assets for this specific sample (for local Pyodide execution)
   * Key: filename, Value: file content
   * @example { "data.txt": "Hello World", "config.json": "{\"key\": \"value\"}" }
   */
  fileAssets?: Record<string, string>;
}

/**
 * Test Case for Evaluation
 * Used for hidden test cases during submission evaluation
 */
export interface QuestionTestCase {
  /** Test case input data or description */
  input: string;
  
  /** Expected output for this test case */
  output: string;
  
  /**
   * Test case type (e.g., "basic", "edge", "boundary")
   * @optional
   */
  type?: string;
  
  /**
   * Description of what this test case is testing
   * @optional
   */
  description?: string;
  
  /**
   * File assets for this specific test case (for remote Piston execution)
   * Key: filename, Value: file content
   * @example { "server.log": "[INFO] System started\n[ERROR] Failed to connect" }
   */
  fileAssets?: Record<string, string>;
}

/**
 * Complete Question Definition
 * Main structure for importing a question
 */
export interface QuestionImportData {
  /** Question title (required) */
  title: string;
  
  /** Question description/problem statement (required) */
  description: string;
  
  /**
   * Category/topic slug
   * @example "file-io", "string-manipulation", "data-structures"
   * @optional - will be derived from import context if not provided
   */
  category?: string;
  
  /**
   * Question difficulty level
   * @default "medium"
   */
  difficulty?: 'easy' | 'medium' | 'hard';
  
  /**
   * Array of sample test cases (visible to users)
   * Recommended: 1-5 samples
   * @minItems 1
   */
  samples: QuestionSample[];
  
  /**
   * Array of hidden test cases (for evaluation)
   * Recommended: 10-20 test cases including edge cases
   * @minItems 1
   */
  testCases: QuestionTestCase[];
  
  /**
   * Reference solution code (Python)
   * Used as the correct implementation
   */
  referenceCode: string;
  
  /**
   * Global file assets available to all samples and test cases
   * Will be used as fallback if sample/testCase doesn't define its own fileAssets
   * Key: filename, Value: file content
   * @optional
   */
  fileAssets?: Record<string, string>;
  
  /**
   * Classification tags for the question
   * @example ["字串處理", "檔案讀寫", "數學運算"]
   * @optional
   */
  tags?: string[];
  
  /**
   * Additional constraints or notes
   * @optional
   */
  constraints?: string;
  
  /**
   * Time limit in milliseconds
   * @default 5000
   * @optional
   */
  timeLimit?: number;
  
  /**
   * Memory limit in MB
   * @default 256
   * @optional
   */
  memoryLimit?: number;
}

/**
 * Import Payload Structure
 * Complete structure for importing one or more questions
 */
export interface QuestionImportPayload {
  /**
   * Subject ID to associate questions with
   * @optional - can be provided via API parameter
   */
  subjectId?: string;
  
  /**
   * Category ID or slug
   * @optional - will be created if doesn't exist
   */
  category?: string;
  
  /**
   * Single question or array of questions
   */
  questions: QuestionImportData | QuestionImportData[];
}

/**
 * Example Usage:
 * 
 * ```typescript
 * const questionData: QuestionImportData = {
 *   title: "Log 檔案分析",
 *   description: "讀取 server.log 並統計 ERROR 和 INFO 數量",
 *   difficulty: "medium",
 *   samples: [
 *     {
 *       input: "server.log: (Empty)",
 *       output: "ERROR count: 0\nINFO count: 0",
 *       fileAssets: {
 *         "server.log": ""
 *       }
 *     }
 *   ],
 *   testCases: [
 *     {
 *       input: "server.log: [INFO] Started\n[ERROR] Failed",
 *       output: "ERROR count: 1\nINFO count: 1",
 *       fileAssets: {
 *         "server.log": "[INFO] Started\n[ERROR] Failed"
 *       }
 *     }
 *   ],
 *   referenceCode: `error_count = 0
 * info_count = 0
 * with open('server.log', 'r') as f:
 *     for line in f:
 *         if 'ERROR' in line:
 *             error_count += 1
 *         if 'INFO' in line:
 *             info_count += 1
 * print(f"ERROR count: {error_count}")
 * print(f"INFO count: {info_count}")`,
 *   tags: ["檔案讀寫", "字串處理"]
 * };
 * ```
 */
