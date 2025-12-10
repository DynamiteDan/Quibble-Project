import { QUESTIONS, Question } from '../data/questions';

export interface MatchResult {
    question: Question;
    confidence: number;
}

export class QuizEngine {
    private apiKey: string;
    // Using gemini-2.0-flash which is the stable version available in your model list
    private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent';

    constructor() {
        this.apiKey = process.env.GOOGLE_API_KEY || '';
        if (!this.apiKey) {
            console.warn("GOOGLE_API_KEY is not set. QuizEngine will not function correctly.");
        }
    }

    /**
     * Processes input text to find a matching trivia question using Gemini
     * @param text The transcribed text or simulated input
     * @returns The best matching result or null if no strong match found
     */
    public async processText(text: string): Promise<MatchResult | null> {
        // Ignore very short inputs to save API calls and reduce noise
        if (!text || text.trim().length < 10) return null;
        
        if (!this.apiKey) {
            console.error("Missing GOOGLE_API_KEY");
            return null;
        }

        try {
            // Add 'answer' to system instruction to guide the model better
            const prompt = `You are an expert Quiz Bowl player and editor. Your task is to identify the precise answer (the "entity") to the trivia tossup clue provided.

Context:
- The input text is a stream of a "tossup" question being read aloud.
- It may be incomplete or cut off mid-sentence.
- Quiz Bowl questions are "pyramidal": they start with obscure clues and become easier.
- The prompt often contains a pronoun or determinator indicating the answer type (e.g., "This **author** wrote...", "This **battle** saw...", "This **chemical element**...").

Rules:
1. Identify the entity type requested (e.g., Person, Place, Work, Event, Substance). The answer MUST match this type.
   - Example: If the clue says "This novel...", the answer must be the novel's title, NOT the author.
   - Example: If the clue says "This composer...", the answer must be the person, NOT one of their works.
2. Use the proper nouns and facts provided to triangulate the specific answer.
3. If the clue is too vague, generic, or short to identify a unique answer with high confidence (e.g., "This man was born in 1950..."), output "NO MATCH".
4. Do NOT guess unless you are reasonably certain based on the specific combination of facts.
5. Output "NO MATCH" if the input does not look like a quiz bowl question, or if you are unsure of the answer.

Format:
Reasoning: <Brief step-by-step logic identifying the entity type and matching facts>
ANSWER: <The concise entity name (e.g. "Abraham Lincoln", "The Great Gatsby", "Photosynthesis")>

Clue: "${text}"`;

            const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.1, // Lower temperature for more deterministic/factual answers
                        maxOutputTokens: 2000 
                    }
                })
            });

            if (!response.ok) {
                console.error(`Gemini API error: ${response.status} ${response.statusText}`);
                const errorBody = await response.text();
                console.error(`Gemini Error Body: ${errorBody}`);
                return null;
            }

            const data = await response.json() as any;
            // console.log("Gemini Raw Response:", JSON.stringify(data)); // Uncomment for deep debugging
            const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            console.log(`Gemini Full Response: "${contentText}"`);

            if (!contentText || contentText.includes('NO MATCH')) {
                return null;
            }

            // Parse reasoning and answer
            let answerText = contentText;
            const answerMatch = contentText.match(/ANSWER:\s*(.+)/i);
            if (answerMatch) {
                answerText = answerMatch[1].trim();
            } else {
                // Fallback if format isn't perfect
                console.warn("Could not parse ANSWER: tag, using full text or skipping.");
                // If it's long (reasoning included) but no tag, we might want to skip or try to infer.
                // For safety, if no ANSWER tag, assume NO MATCH or just return the text if it's short.
                if (contentText.length > 50) return null; 
            }

            // Synthesize a Question object for the app compatibility
            const question: Question = {
                id: 'gemini-generated',
                category: 'General Knowledge',
                text: text,
                answer: answerText,
                keywords: []
            };

            return {
                question: question,
                confidence: 10 // Arbitrary high score since the AI is confident
            };

        } catch (error) {
            console.error("Error calling Gemini API:", error);
            return null;
        }
    }
}
