import { ToolCall, AppServer, AppSession } from '@mentra/sdk';
import { QuizEngine } from './services/QuizEngine';
import path from 'path';
import { setupExpressRoutes } from './webview';
import { handleToolCall } from './tools';

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

class ExampleMentraOSApp extends AppServer {
  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
      publicDir: path.join(__dirname, '../public'),
    });

    // Set up Express routes
    setupExpressRoutes(this);
  }

  /** Map to store active user sessions */
  private userSessionsMap = new Map<string, AppSession>();

  /**
   * Handles tool calls from the MentraOS system
   * @param toolCall - The tool call request
   * @returns Promise resolving to the tool call response or undefined
   */
  protected async onToolCall(toolCall: ToolCall): Promise<string | undefined> {
    return handleToolCall(toolCall, toolCall.userId, this.userSessionsMap.get(toolCall.userId));
  }

  /**
   * Handles new user sessions
   * Sets up event listeners and displays welcome message
   * @param session - The app session instance
   * @param sessionId - Unique session identifier
   * @param userId - User identifier
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    this.userSessionsMap.set(userId, session);

    // 1. Capability Check: Ensure device has required hardware
    if (!session.capabilities?.hasDisplay) {
        console.warn("Device does not have a display. Quibble requires a display.");
        return;
    }
    
    if (!session.capabilities?.hasMicrophone) {
        console.warn("Device does not have a microphone. Quibble requires a microphone.");
        // We can still show the UI but active listening won't work
        session.layouts.showTextWall("Microphone not available. App is in read-only mode.");
    } else {
        // Show welcome message only if we have a display
        session.layouts.showTextWall("Quibble Ready. Ask me a trivia question!");
    }

    // 2. Error Handling: specific to permissions
    session.events.on('error', (error: any) => {
        console.error("Session error:", error);
        if (error.code === 'PERMISSION_DENIED' || error.message?.includes('permission')) {
            session.layouts.showTextWall("Microphone permission denied. Please enable it in settings.");
        }
    });

    const quizEngine = new QuizEngine();


    // State for debounce/spam prevention
    let lastAnswerId: string | null = null;
    let lastBuzzTime = 0;

    /**
     * Handles transcription display based on settings
     * @param text - The transcription text to display
     * @param isFinal - Whether the transcription is final
     */
    const handleTranscription = async (text: string, isFinal: boolean): Promise<void> => {
      const showLiveTranscription = session.settings.get<boolean>('show_live_transcription', true);

      if (showLiveTranscription) {
        console.log(`Transcript received (Final: ${isFinal}):`, text);
      }

      // Optimization: Only call Gemini on final results or long pauses to save cost/latency
      // OR call it if we have enough context.
      // For now, let's strictly restrict to Final results or very long texts (buffer).
      if (!isFinal && text.length < 30) return;

      // Process with QuizEngine
      const match = await quizEngine.processText(text);
      if (match) {
        // Since Gemini handles the logic, we trust its output
        
        // De-duplicate same answers if they come in sequence
        if (match.question.answer !== lastAnswerId) { // Using answer text as ID effectively
            console.log(`Match found: ${match.question.answer}`);
            
            // Show question (input) on top, Answer on bottom
            session.layouts.showDoubleTextWall({
                topText: text.length > 50 ? "..." + text.substring(text.length - 50) : text,
                bottomText: `Answer: ${match.question.answer}`
            });
            
            lastAnswerId = match.question.answer;
        }
      } else if (showLiveTranscription) {
        // If no match yet, just show what the user is saying (if enabled)
        session.layouts.showTextWall(text);
      }
    };

    // Listen for transcriptions
    session.events.onTranscription((data) => {
      // We don't await here to avoid blocking the event loop
      handleTranscription(data.text, data.isFinal).catch(console.error);
    });

    // Listen for setting changes to update transcription display behavior
    session.settings.onValueChange(
      'show_live_transcription',
      (newValue: boolean, oldValue: boolean) => {
        console.log(`Live transcription setting changed from ${oldValue} to ${newValue}`);
        if (newValue) {
          console.log("Live transcription display enabled");
        } else {
          console.log("Live transcription display disabled");
        }
      }
    );

    // automatically remove the session when the session ends
    this.addCleanupHandler(() => this.userSessionsMap.delete(userId));
  }
}

// Start the server
const app = new ExampleMentraOSApp();

app.start().catch(console.error);