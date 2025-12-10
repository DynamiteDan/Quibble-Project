export interface Question {
    id: string;
    category: string;
    text: string;
    answer: string;
    keywords: string[];
}

export const QUESTIONS: Question[] = [
    {
        id: 'q1',
        category: 'Science',
        text: 'What is the chemical symbol for Gold?',
        answer: 'Au',
        keywords: ['chemical symbol', 'gold', 'element', 'au', '79', 'metal', 'transition metal', 'atomic number 79']
    },
    {
        id: 'q2',
        category: 'Geography',
        text: 'What is the capital of France?',
        answer: 'Paris',
        keywords: ['capital', 'france', 'city', 'eiffel tower', 'louvre', 'seine']
    },
    {
        id: 'q3',
        category: 'History',
        text: 'Who was the first President of the United States?',
        answer: 'George Washington',
        keywords: ['first president', 'united states', 'usa', 'washington', 'george washington', 'continental army', 'mount vernon']
    },
    {
        id: 'q4',
        category: 'Literature',
        text: 'Who wrote "Romeo and Juliet"?',
        answer: 'William Shakespeare',
        keywords: ['wrote', 'romeo and juliet', 'playwright', 'shakespeare', 'bard of avon', 'stratford-upon-avon', 'macbeth', 'hamlet', 'globe theatre']
    },
    {
        id: 'q5',
        category: 'Science',
        text: 'What planet is known as the Red Planet?',
        answer: 'Mars',
        keywords: ['red planet', 'planet', 'mars', 'fourth planet', 'olympus mons', 'phobos', 'deimos']
    },
    {
        id: 'q6',
        category: 'Physics',
        text: 'What is the speed of light?',
        answer: '299,792,458 m/s',
        keywords: ['speed of light', 'constant', 'physics', '299,792,458', 'vacuum', 'photon']
    },
    {
        id: 'q7',
        category: 'History',
        text: 'In which year did the Titanic sink?',
        answer: '1912',
        keywords: ['titanic', 'sink', 'year', 'iceberg', '1912', 'white star line', 'unsinkable']
    },
    {
        id: 'q8',
        category: 'Art',
        text: 'Who painted the Mona Lisa?',
        answer: 'Leonardo da Vinci',
        keywords: ['painted', 'mona lisa', 'artist', 'da vinci', 'leonardo', 'renaissance', 'louvre']
    }
];
