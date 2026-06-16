const STORAGE_KEY = 'testara_saved_exams';
const MAX_SAVED = 20;

/**
 * Save current exam state to localStorage.
 * Returns the saved exam's ID.
 */
export function saveExam(examState) {
    const saved = getSavedExams();
    const id = examState._saveId || `exam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const entry = {
        id,
        label: `${(examState.examType || 'exam').toUpperCase()} – ${examState.testFormat || 'test'}`,
        savedAt: new Date().toISOString(),
        examType: examState.examType,
        testFormat: examState.testFormat,
        questions: examState.questions,
        answers: examState.answers,
        markedForReview: examState.markedForReview,
        timeSpent: examState.timeSpent,
        currentQuestionIndex: examState.currentQuestionIndex,
        timeLeft: examState.timeLeft,
        totalQuestions: examState.questions?.length || 0,
        answeredCount: Object.keys(examState.answers || {}).length,
    };

    // Update existing or prepend new
    const idx = saved.findIndex(e => e.id === id);
    if (idx >= 0) {
        saved[idx] = entry;
    } else {
        saved.unshift(entry);
    }

    // Prune oldest if over limit
    while (saved.length > MAX_SAVED) {
        saved.pop();
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    return id;
}

/**
 * Get all saved exam summaries (lightweight, for listing)
 */
export function getSavedExams() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/**
 * Load a full saved exam by ID
 */
export function loadExam(id) {
    const saved = getSavedExams();
    return saved.find(e => e.id === id) || null;
}

/**
 * Delete a saved exam by ID
 */
export function deleteExam(id) {
    const saved = getSavedExams().filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}
