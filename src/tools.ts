import { ToolCall, AppSession } from '@mentra/sdk';
import { QuizEngine } from './services/QuizEngine';

/**
 * Handle a tool call
 * @param toolCall - The tool call from the server
 * @param userId - The user ID of the user who called the tool
 * @param session - The session object if the user has an active session
 * @returns A promise that resolves to the tool call result
 */
export async function handleToolCall(toolCall: ToolCall, userId: string, session: AppSession | undefined): Promise<string | undefined> {
  console.log(`Tool called: ${toolCall.toolId}`);

  if (toolCall.toolId === "emulate_input" && session) {
    const text = toolCall.toolParameters?.text as string;
    if (!text) return "No text provided";

    console.log(`Simulating input: ${text}`);

    // Process with local QuizEngine instance
    const quizEngine = new QuizEngine();
    const match = await quizEngine.processText(text);

    if (match) {
      const response = `Answer: ${match.question.answer}`;
      session.layouts.showTextWall(response);
      return `Processed "${text}" and found answer: ${match.question.answer}`;
    } else {
      session.layouts.showTextWall(`No quiz match for: "${text}"`);
      return `Processed "${text}" but found no match.`;
    }
  }

  return undefined;
}