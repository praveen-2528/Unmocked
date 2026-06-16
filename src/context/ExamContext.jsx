import React, { createContext, useContext, useState } from 'react';

const ExamContext = createContext();

export const useExam = () => useContext(ExamContext);

export const ExamProvider = ({ children }) => {
    const [examState, setExamState] = useState({
        examType: null, // 'ssc' or 'ibps'
        testFormat: null, // 'full', 'subject', 'topic'
        questions: [],
        testStarted: false,
        currentQuestionIndex: 0,
        answers: {}, // { questionId: selectedOptionIndex }
        markedForReview: [], // array of question indices marked for review
        timeSpent: [], // array where index is questionIndex and value is seconds spent
        timeLeft: null, // total time remaining in seconds
        isMultiplayer: false,
        roomCode: null,
        _saveId: null, // for save/resume tracking
        markingScheme: { correct: 2, incorrect: -0.5, unattempted: 0 },
    });

    const updateExamState = (updates) => {
        setExamState((prev) => ({ ...prev, ...updates }));
    };

    const resetExam = () => {
        setExamState({
            examType: null,
            testFormat: null,
            questions: [],
            testStarted: false,
            currentQuestionIndex: 0,
            answers: {},
            markedForReview: [],
            timeSpent: [],
            timeLeft: null,
            isMultiplayer: false,
            roomCode: null,
            _saveId: null,
            markingScheme: { correct: 2, incorrect: -0.5, unattempted: 0 },
        });
    };

    const loadSavedState = (saved) => {
        setExamState({
            examType: saved.examType,
            testFormat: saved.testFormat,
            questions: saved.questions,
            testStarted: true,
            currentQuestionIndex: saved.currentQuestionIndex || 0,
            answers: saved.answers || {},
            markedForReview: saved.markedForReview || [],
            timeSpent: saved.timeSpent || [],
            timeLeft: saved.timeLeft,
            isMultiplayer: false,
            roomCode: null,
            _saveId: saved.id,
            markingScheme: saved.markingScheme || { correct: 2, incorrect: -0.5, unattempted: 0 },
        });
    };

    return (
        <ExamContext.Provider value={{ ...examState, updateExamState, resetExam, loadSavedState }}>
            {children}
        </ExamContext.Provider>
    );
};
