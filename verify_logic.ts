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

(async () => {
    for (const text of testCases) {
        console.log(`Input: "${text}"`);
        const match = await engine.processText(text, {
            clueSoFar: '',
            recentSegment: text,
            alreadyAnswered: false,
            lastAnswer: null,
        });
        if (match && match.action === 'answer') {
            console.log(`  MATCH: ${match.question.id} -> ${match.question.text}`);
            console.log(`         Answer: ${match.question.answer} (Score: ${match.confidence.toFixed(2)})`);
        } else if (match && match.action === 'reset') {
            console.log(`  RESET`);
        } else if (match && match.action === 'chatter') {
            console.log(`  CHATTER`);
        } else {
            console.log(`  NO MATCH`);
        }
        console.log("---");
    }
})().catch((err) => {
    console.error("verify_logic failed:", err);
    process.exitCode = 1;
});
