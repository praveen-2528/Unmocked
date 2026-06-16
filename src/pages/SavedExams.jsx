import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../context/ExamContext';
import { getSavedExams, deleteExam } from '../utils/storage';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Folder, Play, Trash2, ChevronLeft, Clock, FileQuestion } from 'lucide-react';
import './SavedExams.css';

const SavedExams = () => {
    const navigate = useNavigate();
    const { loadSavedState } = useExam();
    const [exams, setExams] = React.useState([]);

    React.useEffect(() => {
        setExams(getSavedExams());
    }, []);

    const handleResume = (exam) => {
        loadSavedState(exam);
        navigate('/test');
    };

    const handleDelete = (id) => {
        if (window.confirm('Delete this saved exam?')) {
            deleteExam(id);
            setExams(getSavedExams());
        }
    };

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="saved-container animate-fade-in">
            <div className="saved-header">
                <h1><Folder size={32} /> Saved Exams</h1>
                <p>Continue where you left off</p>
            </div>

            {exams.length === 0 ? (
                <Card className="empty-state">
                    <FileQuestion size={64} className="empty-icon" />
                    <h3>No saved exams yet</h3>
                    <p>Start a test and use "Save & Exit" to save your progress.</p>
                    <Button variant="primary" onClick={() => navigate('/')}>Start a New Test</Button>
                </Card>
            ) : (
                <div className="saved-grid">
                    {exams.map((exam) => {
                        const progress = exam.totalQuestions > 0 ? Math.round((exam.answeredCount / exam.totalQuestions) * 100) : 0;
                        return (
                            <Card key={exam.id} className="saved-card">
                                <div className="saved-card-header">
                                    <span className="exam-type-badge">{exam.examType?.toUpperCase()}</span>
                                    <span className="saved-date">
                                        <Clock size={12} /> {formatDate(exam.savedAt)}
                                    </span>
                                </div>
                                <h3 className="saved-label">{exam.label}</h3>
                                <div className="progress-section">
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                                    </div>
                                    <span className="progress-text">{exam.answeredCount}/{exam.totalQuestions} answered ({progress}%)</span>
                                </div>
                                <div className="saved-card-actions">
                                    <Button variant="primary" size="sm" onClick={() => handleResume(exam)}>
                                        <Play size={14} /> Continue
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(exam.id)}>
                                        <Trash2 size={14} />
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <div className="saved-back">
                <Button variant="ghost" onClick={() => navigate('/')}>
                    <ChevronLeft size={16} /> Back to Setup
                </Button>
            </div>
        </div>
    );
};

export default SavedExams;
