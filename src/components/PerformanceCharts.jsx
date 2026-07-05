import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import Card from './ui/Card';
import './PerformanceCharts.css';

const PerformanceCharts = ({ history }) => {
    // 1. Line Chart Data (Scores over time)
    const lineData = useMemo(() => {
        if (!history || history.length === 0) return [];
        // Take the last 15 tests, sorted chronologically
        const recent = [...history].reverse().slice(-15);
        return recent.map((test, index) => ({
            name: `Test ${index + 1}`,
            date: new Date(test.created_at).toLocaleDateString(),
            score: test.percentage || 0
        }));
    }, [history]);

    // 2. Pie Chart Data (Accuracy Breakdown)
    const pieData = useMemo(() => {
        if (!history || history.length === 0) return [];
        let totalCorrect = 0;
        let totalIncorrect = 0;
        let totalUnattempted = 0;

        history.forEach(test => {
            totalCorrect += test.correct || 0;
            totalIncorrect += test.incorrect || 0;
            totalUnattempted += test.unattempted || 0;
        });

        const total = totalCorrect + totalIncorrect + totalUnattempted;
        if (total === 0) return [];

        return [
            { name: 'Correct', value: totalCorrect, color: '#10b981' },
            { name: 'Incorrect', value: totalIncorrect, color: '#ef4444' },
            { name: 'Unattempted', value: totalUnattempted, color: '#94a3b8' }
        ];
    }, [history]);

    if (!history || history.length === 0) {
        return null;
    }

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="custom-chart-tooltip glass">
                    <p className="tooltip-date">{payload[0].payload.date}</p>
                    <p className="tooltip-score">Score: <strong>{payload[0].value}%</strong></p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="performance-charts-container">
            <h3 className="charts-section-title">Performance Analytics</h3>
            <div className="charts-grid">
                
                {/* Line Chart: Progress */}
                <Card className="chart-card glass">
                    <h4>Score Progression (Last 15 Tests)</h4>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={lineData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} tickLine={false} />
                                <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Line 
                                    type="monotone" 
                                    dataKey="score" 
                                    stroke="#6366f1" 
                                    strokeWidth={3} 
                                    dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 0 }}
                                    activeDot={{ r: 6, fill: '#ec4899', strokeWidth: 0 }} 
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Pie Chart: Accuracy */}
                <Card className="chart-card glass">
                    <h4>Overall Accuracy</h4>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip 
                                    contentStyle={{ background: 'rgba(15, 23, 42, 0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

            </div>
        </div>
    );
};

export default PerformanceCharts;
