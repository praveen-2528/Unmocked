const HISTORY_KEY = 'testara_test_history';
const MAX_HISTORY = 50;

/**
 * Save a test result to history.
 */
export function saveTestResult(result) {
    const history = getTestHistory();

    const entry = {
        id: `hist_${Date.now()}`,
        date: new Date().toISOString(),
        examType: result.examType || 'ssc',
        testFormat: result.testFormat || 'full',
        score: result.score,
        total: result.total,
        correct: result.correct,
        incorrect: result.incorrect,
        unattempted: result.unattempted || 0,
        totalMarks: result.totalMarks,
        maxMarks: result.maxMarks,
        percentage: result.percentage,
        totalTime: result.totalTime || 0,
        markingScheme: result.markingScheme || null,
        topicBreakdown: result.topicBreakdown || {},
        isMultiplayer: result.isMultiplayer || false,
    };

    history.unshift(entry);

    while (history.length > MAX_HISTORY) {
        history.pop();
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return entry.id;
}

/**
 * Get all test history entries.
 */
export function getTestHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/**
 * Clear all test history.
 */
export function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
}
