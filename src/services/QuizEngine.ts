import { Question } from '../data/questions';

export interface MatchResult {
    question: Question;
    confidence: number;
}

export class QuizEngine {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY || '';
        this.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        // User requested "ChatGPT 5.2" — keep this default but allow overriding via env var.
        this.model = process.env.OPENAI_MODEL || 'gpt-5.2';
        if (!this.apiKey) {
            console.warn("OPENAI_API_KEY is not set. QuizEngine will not function correctly.");
        }
    }

    /**
     * Processes input text to find a matching trivia question using ChatGPT (OpenAI)
     * @param text The transcribed text or simulated input
     * @returns The best matching result or null if no strong match found
     */
    public async processText(text: string): Promise<MatchResult | null> {
        // Ignore very short inputs to save API calls and reduce noise
        if (!text || text.trim().length < 10) return null;
        
        if (!this.apiKey) {
            console.error("Missing OPENAI_API_KEY");
            return null;
        }

        try {
            const systemPrompt = `You are an expert Quiz Bowl player and editor. Your task is to identify the precise answer (the "entity") to the trivia tossup clue provided.

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
`;

            const userPrompt = `Clue: "${text}"`;

            // Use OpenAI Chat Completions for broad compatibility.
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    temperature: 0.1, // Lower temperature for more deterministic/factual answers
                    max_tokens: 600,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                })
            });

            if (!response.ok) {
                console.error(`OpenAI API error: ${response.status} ${response.statusText}`);
                const errorBody = await response.text();
                console.error(`OpenAI Error Body: ${errorBody}`);
                return null;
            }

            const data = await response.json() as any;
            // console.log("OpenAI Raw Response:", JSON.stringify(data)); // Uncomment for deep debugging
            const contentText = data.choices?.[0]?.message?.content?.trim();
            console.log(`OpenAI Full Response: "${contentText}"`);

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
                id: 'openai-generated',
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
            console.error("Error calling OpenAI API:", error);
            return null;
        }
    }
}
