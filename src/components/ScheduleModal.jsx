import React, { useState, useEffect } from 'react';
import { X, Search, Calendar, CheckCircle2, Circle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './ScheduleModal.css';

const ScheduleModal = ({ onClose }) => {
    const { authFetch } = useAuth();
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [todayStr, setTodayStr] = useState('');

    useEffect(() => {
        // Calculate local YYYY-MM-DD
        const d = new Date();
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - (offset * 60 * 1000));
        setTodayStr(localDate.toISOString().split('T')[0]);

        setLoading(true);
        authFetch('/api/schedule/all')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load schedule from server');
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    setSchedule(data.schedule || []);
                } else {
                    throw new Error(data.error || 'Server error loading schedule');
                }
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [authFetch]);

    // Filter schedule rows based on search
    const filteredSchedule = schedule.filter(row => {
        const query = searchQuery.toLowerCase();
        return (
            (row.date && row.date.includes(query)) ||
            (row.day && row.day.toLowerCase().includes(query)) ||
            (row.topic1 && row.topic1.toLowerCase().includes(query)) ||
            (row.topic2 && row.topic2.toLowerCase().includes(query)) ||
            (row.topic3 && row.topic3.toLowerCase().includes(query)) ||
            (row.topic4 && row.topic4.toLowerCase().includes(query))
        );
    });

    const formatDateReadable = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div className="schedule-backdrop animate-fade-in">
            <div className="schedule-modal glass animate-scale-in">
                {/* Header */}
                <div className="schedule-header">
                    <div className="schedule-title-area">
                        <div className="title-icon"><Calendar size={22} className="text-primary" /></div>
                        <div>
                            <h2>65-Day Complete Study Schedule</h2>
                            <p>Daily goals aligned to competitive exams preparation</p>
                        </div>
                    </div>
                    <button className="schedule-close-btn" onClick={onClose} title="Close">
                        <X size={20} />
                    </button>
                </div>

                {/* Search Bar */}
                <div className="schedule-search-row">
                    <div className="search-input-wrapper">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search topics, days, subjects or dates (e.g. Geometry, Prepositions)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button className="clear-search" onClick={() => setSearchQuery('')}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="schedule-content">
                    {loading ? (
                        <div className="schedule-loader">
                            <div className="loading-spinner"></div>
                            <p>Loading study calendar...</p>
                        </div>
                    ) : error ? (
                        <div className="schedule-error glass">
                            <p>⚠️ {error}</p>
                        </div>
                    ) : filteredSchedule.length === 0 ? (
                        <div className="schedule-empty glass">
                            <p>No schedule matches found for your search query.</p>
                        </div>
                    ) : (
                        <div className="schedule-table-wrapper">
                            <table className="schedule-table">
                                <thead>
                                    <tr>
                                        <th>Date & Day</th>
                                        <th>Logical Reasoning</th>
                                        <th>Quantitative Aptitude</th>
                                        <th>English Language</th>
                                        <th>General Studies & GK</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSchedule.map((row, index) => {
                                        const isToday = row.date === todayStr;
                                        return (
                                            <tr key={index} className={`schedule-row ${isToday ? 'is-today' : ''}`}>
                                                <td className="date-cell">
                                                    <span className="date-txt">{formatDateReadable(row.date)}</span>
                                                    <span className="day-txt">{row.day}</span>
                                                    {isToday && <span className="today-badge">Today</span>}
                                                </td>
                                                <td><span className="topic-text">{row.topic1 || '—'}</span></td>
                                                <td><span className="topic-text">{row.topic2 || '—'}</span></td>
                                                <td><span className="topic-text">{row.topic3 || '—'}</span></td>
                                                <td><span className="topic-text">{row.topic4 || '—'}</span></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ScheduleModal;
