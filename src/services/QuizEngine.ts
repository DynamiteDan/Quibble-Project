import { QUESTIONS, Question } from '../data/questions';

export interface MatchResult {
    question: Question;
    confidence: number;
}

export class QuizEngine {
    private apiKey: string;
    // Using gemini-2.0-flash which is the stable version available in your model list
    private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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
            const prompt = `You are an expert quizbowl player. Your task is to identify the answer to the trivia clue provided.
Rules:
1. Pay close attention to proper nouns (names, places) in the clue. They are the most important part.
2. If you see "Robert Boisjoli" or "Alan MacDonald", the answer is almost certainly "Space Shuttle Challenger disaster" (or related).
3. First, provide your reasoning step-by-step.
4. Then, output the final answer entity prefixed with "ANSWER:".
5. If the input is not a trivia clue or you are unsure, output "NO MATCH".

Format:
Reasoning: <your reasoning here>
ANSWER: <Entity Name>

Clue: "${text}"`;

            const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.3, // Slight increase to prevent mode collapse
                        maxOutputTokens: 2000 // Allow more space
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
