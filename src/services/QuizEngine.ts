import { Question } from '../data/questions';

export interface MatchResult {
    question: Question;
    confidence: number;
}

export class QuizEngine {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    private async callOpenAIChat(
        systemPrompt: string,
        userPrompt: string,
        model: string,
        tokenParam: 'max_completion_tokens' | 'max_tokens' = 'max_completion_tokens'
    ): Promise<Response> {
        return fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model,
                temperature: 0.1, // Lower temperature for more deterministic/factual answers
                [tokenParam]: 600,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
            }),
        });
    }

    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY || '';
        this.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        // Prefer the "instant" tier by default, but allow overriding via env var.
        // If your account doesn't have this model, we'll automatically fall back to 'gpt-5.2'.
        this.model = process.env.OPENAI_MODEL || 'gpt-5.2-chat-latest';
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
1. Determine the requested answer type (Person, Place, Work, Event, Concept, Substance, etc.) from wording like "This author...", "This novel...", "This battle...", etc.
2. The answer MUST match that type.
   - If it says "This novel...", answer the novel title (not the author).
   - If it says "This composer...", answer the person (not a work).
3. Use the specific combination of named entities and facts to identify the single best answer.
4. If the clue is incomplete/too vague, has multiple plausible answers, or you are not highly confident: output NO MATCH.
5. If the input does not resemble a quiz bowl tossup clue: output NO MATCH.

Output requirements (critical):
- Output EXACTLY one line.
- Either: NO MATCH
- Or: ANSWER: <entity name>
- Do NOT include reasoning, quotes, markdown, or extra text.

Examples:
Clue: "This novel begins with the line 'Call me Ishmael'..."
ANSWER: Moby-Dick

Clue: "This man was born in 1950 and later became famous."
NO MATCH
`;

            const userPrompt = `Clue: "${text}"`;

            // Use OpenAI Chat Completions for broad compatibility.
            // If the configured model isn't available, fall back to gpt-5.2 once.
            let response = await this.callOpenAIChat(systemPrompt, userPrompt, this.model, 'max_completion_tokens');
            if (!response.ok) {
                const errorBody = await response.text();
                const errorBodyLower = errorBody.toLowerCase();
                const looksLikeModelIssue =
                    response.status === 400 ||
                    response.status === 404 ||
                    errorBodyLower.includes('model') ||
                    errorBodyLower.includes('not found');

                // Some models use max_completion_tokens instead of max_tokens (and vice versa).
                // If we hit that specific error, retry once with the alternate parameter.
                if (
                    response.status === 400 &&
                    (errorBodyLower.includes("unsupported parameter") || errorBodyLower.includes("unsupported_parameter")) &&
                    (errorBodyLower.includes("max_tokens") || errorBodyLower.includes("max_completion_tokens"))
                ) {
                    const retryTokenParam: 'max_completion_tokens' | 'max_tokens' =
                        errorBodyLower.includes("use 'max_completion_tokens'") ? 'max_completion_tokens' : 'max_tokens';
                    console.warn(`Retrying OpenAI request using '${retryTokenParam}'...`);
                    response = await this.callOpenAIChat(systemPrompt, userPrompt, this.model, retryTokenParam);
                } else if (looksLikeModelIssue && this.model !== 'gpt-5.2') {
                    console.warn(`Model '${this.model}' failed; retrying with 'gpt-5.2'.`);
                    response = await this.callOpenAIChat(systemPrompt, userPrompt, 'gpt-5.2', 'max_completion_tokens');
                } else {
                    console.error(`OpenAI API error: ${response.status} ${response.statusText}`);
                    console.error(`OpenAI Error Body: ${errorBody}`);
                    return null;
                }

                // If the retry also failed, log the latest response body for debugging.
                if (!response.ok) {
                    console.error(`OpenAI API error: ${response.status} ${response.statusText}`);
                    const retryErrorBody = await response.text();
                    console.error(`OpenAI Error Body: ${retryErrorBody}`);
                    return null;
                }
            }

            if (!response.ok) {
                console.error(`OpenAI API error: ${response.status} ${response.statusText}`);
                const errorBody = await response.text();
                console.error(`OpenAI Error Body: ${errorBody}`);
                return null;
            }

            const data = await response.json() as any;
            // console.log("OpenAI Raw Response:", JSON.stringify(data)); // Uncomment for deep debugging
            const rawText = data.choices?.[0]?.message?.content?.trim();
            const contentText = rawText
                ?.replace(/```[\s\S]*?```/g, (m: string) => m.replace(/```/g, '').trim()) // strip fenced blocks if any
                ?.replace(/^["'`]+|["'`]+$/g, '') // strip wrapping quotes/backticks
                ?.trim();
            console.log(`OpenAI Full Response: "${contentText}"`);

            if (!contentText || contentText.includes('NO MATCH')) {
                return null;
            }

            // Parse reasoning and answer
            let answerText = contentText;
            const answerMatch = contentText.match(/^ANSWER:\s*(.+)\s*$/im);
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
