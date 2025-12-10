import { QuizEngine } from './src/services/QuizEngine';

const engine = new QuizEngine();

const testCases = [
    "What is the capital of France?",
    "Tell me about the chemical symbol for Gold please",
    "Who wrote Romeo and Juliet?",
    "What is the speed of light?",
    "Who painted the Mona Lisa?",
    "Random noise"
];

console.log("Running QuizEngine Tests...\n");

for (const text of testCases) {
    console.log(`Input: "${text}"`);
    const match = engine.processText(text);
    if (match) {
        console.log(`  MATCH: ${match.question.id} -> ${match.question.text}`);
        console.log(`         Answer: ${match.question.answer} (Score: ${match.confidence.toFixed(2)})`);
    } else {
        console.log(`  NO MATCH`);
    }
    console.log("---");
}
