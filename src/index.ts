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
        session.layouts.showTextWall(" ");
    }

    // 2. Error Handling: specific to permissions
    session.events.on('error', (error: any) => {
        console.error("Session error:", error);
        if (error.code === 'PERMISSION_DENIED' || error.message?.includes('permission')) {
            session.layouts.showTextWall("Microphone permission denied. Please enable it in settings.");
        }
    });

    const quizEngine = new QuizEngine();


    // State for debounce/spam prevention and display timeout
    let lastAnswerId: string | null = null;
    let lastBuzzTime = 0;
    let clearDisplayTimer: NodeJS.Timeout | null = null;
    
    // State for smart interval processing
    let lastProcessedLength = 0;
    
    // Buffer to store accumulated transcript text across multiple utterances
    let accumulatedTranscript = "";

    // Helper to reset the clear timer
    const resetClearTimer = () => {
        if (clearDisplayTimer) clearTimeout(clearDisplayTimer);
        
        clearDisplayTimer = setTimeout(() => {
            // session.layouts.clear() is not available in all SDK versions
            // Fallback: Show empty text wall or welcome message
            session.layouts.showTextWall(" ");
            lastAnswerId = null; // Reset state so same answer can trigger again if needed
            lastProcessedLength = 0; // Reset length tracking
            accumulatedTranscript = ""; // Reset accumulated transcript
        }, 3000); // 3 seconds
    };

    /**
     * Handles transcription display based on settings
     * @param text - The transcription text to display
     * @param isFinal - Whether the transcription is final
     */
    const handleTranscription = async (text: string, isFinal: boolean): Promise<void> => {
      resetClearTimer(); // Reset timer whenever we hear something

      const showLiveTranscription = session.settings.get<boolean>('show_live_transcription', true);
      
      // Construct the full text with history. 
      // If we have accumulated text, append the current text to it.
      let fullText = accumulatedTranscript;
      if (text && text.trim().length > 0) {
          fullText = accumulatedTranscript ? `${accumulatedTranscript} ${text}` : text;
      }
      
      // Note: we removed the manual check for text.length < lastProcessedLength 
      // because we are now using fullText which should strictly grow until reset.

      if (showLiveTranscription) {
        console.log(`Transcript received (Final: ${isFinal}):`, text);
        console.log(`Full context:`, fullText);
        
        // Show continuous transcription. If we have an answer, keep it visible.
        try {
            if (lastAnswerId) {
                 const questionText = fullText.length > 50 ? "..." + fullText.substring(fullText.length - 50) : fullText;
                 session.layouts.showDoubleTextWall(questionText, `Answer: ${lastAnswerId}`);
            } else {
                 session.layouts.showTextWall(fullText);
            }
        } catch (err) {
            console.error("Error updating display:", err);
        }
      }

      // Logic: 
      // 1. Process if we detect a complete sentence (ending in punctuation) in the FULL text.
      // 2. Always process if it's Final (end of speech).
      
      // Find the last sentence boundary in the full text
      const sentenceEndRegex = /[.?!](?:\s|$)/g;
      let lastMatchIndex = -1;
      let match;
      while ((match = sentenceEndRegex.exec(fullText)) !== null) {
          lastMatchIndex = match.index;
      }

      // Calculate the end position of the last complete sentence (include the punctuation)
      const currentSentenceEnd = lastMatchIndex !== -1 ? lastMatchIndex + 1 : 0;

      const shouldProcess = 
          isFinal || 
          (currentSentenceEnd > lastProcessedLength);

      // If isFinal is true, we need to commit the current text to accumulatedTranscript
      // regardless of whether we process for Gemini or not.
      if (isFinal) {
          if (text && text.trim().length > 0) {
            // Check if the "For 10 points" phrase is present.
            // If so, we assume this is the end of the question and reset the history for the next one.
            if (fullText.toLowerCase().includes("for 10 points")) {
                console.log("Detected 'For 10 points'. Resetting accumulated history.");
                accumulatedTranscript = "";
                // Also reset the processed length so the next question starts fresh
                lastProcessedLength = 0;
            } else {
                accumulatedTranscript = fullText; 
            }
          }
      }

      if (!shouldProcess) return;

      // Update the checkpoint
      lastProcessedLength = isFinal ? fullText.length : currentSentenceEnd;

      // Process with QuizEngine immediately (no debounce) for real-time buzzing
      console.log(`Processing text for match (Length: ${fullText.length})...`);
      const matchResult = await quizEngine.processText(fullText);

      if (matchResult) {
        // Since Gemini handles the logic, we trust its output
        
        // De-duplicate same answers if they come in sequence
        // if (matchResult.question.answer !== lastAnswerId) { 
            console.log(`Match found: ${matchResult.question.answer} (Confidence: ${matchResult.confidence})`);
            
            try {
            // Show question (input) on top, Answer on bottom
            // Passing arguments directly as per SDK error (topText, bottomText)
            const questionText = fullText.length > 50 ? "..." + fullText.substring(fullText.length - 50) : fullText;
            session.layouts.showDoubleTextWall(questionText, `Answer: ${matchResult.question.answer}`);
            console.log("Display updated successfully.");
            } catch (err) {
                console.error("Error updating display:", err);
            }
            
            lastAnswerId = matchResult.question.answer;
        // } else {
        //     console.log(`Skipping duplicate answer: ${matchResult.question.answer}`);
        // }
      } else {
         console.log("No match returned from QuizEngine.");
         // We don't need to update display here because we updated it at the start
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
    this.addCleanupHandler(() => {
        if (clearDisplayTimer) clearTimeout(clearDisplayTimer);
        this.userSessionsMap.delete(userId);
    });
  }
}

// Start the server
const app = new ExampleMentraOSApp();

app.start().catch(console.error);