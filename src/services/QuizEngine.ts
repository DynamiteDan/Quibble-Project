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
1. Output EXACTLY and ONLY the answer entity (e.g., "William Shakespeare", "Photosynthesis", "The Battle of Hastings").
2. Do not explain, do not use punctuation like periods at the end, do not say "The answer is".
3. If the input is not a trivia clue or you are unsure, output "NO MATCH".

Clue: "${text}"
Answer:`;

            const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.1, // Low temperature for deterministic answers
                        maxOutputTokens: 20
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
            const answerText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            console.log(`Gemini Answer: "${answerText}"`);

            if (!answerText || answerText === 'NO MATCH') {
                return null;
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
