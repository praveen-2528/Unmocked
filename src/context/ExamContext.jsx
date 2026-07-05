import React, { createContext, useContext, useState, useEffect } from 'react';
import { saveExam } from '../utils/storage';

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

    const updateExamState = React.useCallback((updates) => {
        setExamState((prev) => {
            const newUpdates = typeof updates === 'function' ? updates(prev) : updates;
            return { ...prev, ...newUpdates };
        });
    }, []);

    useEffect(() => {
        if (examState.testStarted && examState.questions.length > 0) {
            const savedId = saveExam(examState);
            if (examState._saveId !== savedId) {
                setExamState(prev => ({ ...prev, _saveId: savedId }));
            }
        }
    }, [
        examState.testStarted,
        examState.currentQuestionIndex,
        examState.answers,
        examState.markedForReview,
        examState.timeSpent,
        examState.timeLeft
    ]);

    const resetExam = React.useCallback(() => {
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
    }, []);

    const loadSavedState = React.useCallback((saved) => {
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
    }, []);

    return (
        <ExamContext.Provider value={{ ...examState, updateExamState, resetExam, loadSavedState }}>
            {children}
        </ExamContext.Provider>
    );
};
