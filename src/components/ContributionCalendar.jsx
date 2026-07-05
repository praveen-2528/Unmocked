import React from 'react';

// Inline CSS for the contribution calendar to keep things self-contained and neat
const calendarStyles = `
.contrib-calendar-container {
    width: 100%;
    overflow-x: auto;
    padding: 1.5rem;
    background: rgba(20, 26, 40, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    backdrop-filter: blur(16px);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
}
.contrib-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
}
.contrib-title-container {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}
.contrib-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
    font-family: var(--font-heading);
}
.contrib-subtitle {
    font-size: 0.8rem;
    color: var(--text-secondary);
}
.contrib-legend {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
}
.legend-box {
    width: 11px;
    height: 11px;
    border-radius: 2px;
}
.calendar-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    position: relative;
    padding-top: 0.5rem;
}
.month-row {
    display: flex;
    height: 1.25rem;
    position: relative;
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
}
.month-label {
    position: absolute;
    transform: translateX(0);
}
.grid-row-container {
    display: flex;
    gap: 0.35rem;
}
.calendar-week {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
}
.calendar-day {
    width: 11px;
    height: 11px;
    border-radius: 2px;
    position: relative;
    cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.15s ease;
}
.calendar-day:hover {
    transform: scale(1.4);
    z-index: 10;
}
.calendar-day.lvl-0 { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255,255,255,0.02); }
.calendar-day.lvl-1 { background: rgba(16, 185, 129, 0.25); border: 1px solid rgba(16, 185, 129, 0.1); }
.calendar-day.lvl-2 { background: rgba(16, 185, 129, 0.55); border: 1px solid rgba(16, 185, 129, 0.2); }
.calendar-day.lvl-3 { background: rgba(16, 185, 129, 1); box-shadow: 0 0 6px rgba(16, 185, 129, 0.6); }

.calendar-day::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%) translateY(-6px);
    background: #0f172a;
    color: #f1f5f9;
    padding: 0.4rem 0.7rem;
    border-radius: 6px;
    font-size: 0.75rem;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s, transform 0.15s;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    border: 1px solid rgba(255,255,255,0.1);
    z-index: 100;
}
.calendar-day:hover::after {
    opacity: 1;
    transform: translateX(-50%) translateY(-2px);
}
`;

const ContributionCalendar = ({ activity = {} }) => {
    // Inject stylesheet on mount
    React.useEffect(() => {
        const styleId = 'unmocked-calendar-styles';
        if (!document.getElementById(styleId)) {
            const sheet = document.createElement('style');
            sheet.id = styleId;
            sheet.innerText = calendarStyles;
            document.head.appendChild(sheet);
        }
    }, []);

    // Calculate dates for the last 365 days
    const today = new Date();
    const days = [];
    
    // Get start date: 364 days ago
    const startDate = new Date();
    startDate.setDate(today.getDate() - 364);
    
    // Adjust start date to previous Sunday to keep weeks clean
    const startDay = startDate.getDay();
    startDate.setDate(startDate.getDate() - startDay);

    // Loop through and build daily structures
    const curr = new Date(startDate);
    while (curr <= today) {
        // Adjust for timezone differences to output ISO string format YYYY-MM-DD
        const year = curr.getFullYear();
        const month = String(curr.getMonth() + 1).padStart(2, '0');
        const date = String(curr.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${date}`;
        
        days.push({
            dateStr,
            count: activity[dateStr] || 0
        });
        curr.setDate(curr.getDate() + 1);
    }

    // Group days into 7-day chunks (weeks)
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
        weeks.push(days.slice(i, i + 7));
    }

    // Calculate Month labels based on the first day of each week
    const monthLabels = [];
    let lastMonth = '';
    
    weeks.forEach((week, wIndex) => {
        const firstDay = week[0];
        if (firstDay) {
            const parts = firstDay.dateStr.split('-');
            const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            const monthText = dateObj.toLocaleString('default', { month: 'short' });
            if (monthText !== lastMonth) {
                monthLabels.push({ text: monthText, wIndex });
                lastMonth = monthText;
            }
        }
    });

    const formatDateTooltip = (dateStr) => {
        const parts = dateStr.split('-');
        const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Calculate total tests taken in the last 365 days
    const totalTests = Object.values(activity).reduce((sum, val) => sum + (val || 0), 0);

    return (
        <div className="contrib-calendar-container">
            <div className="contrib-header">
                <div className="contrib-title-container">
                    <span className="contrib-title">Testing Consistency</span>
                    <span className="contrib-subtitle">{totalTests} mock test{totalTests !== 1 ? 's' : ''} completed in the past year</span>
                </div>
                <div className="contrib-legend">
                    <span>Less</span>
                    <div className="legend-box lvl-0" />
                    <div className="legend-box lvl-1" />
                    <div className="legend-box lvl-2" />
                    <div className="legend-box lvl-3" />
                    <span>More</span>
                </div>
            </div>

            <div className="calendar-wrapper">
                {/* Month labels row */}
                <div className="month-row">
                    {monthLabels.map((label, idx) => (
                        // Each week column is 11px wide + 0.35rem (which is 5.6px) gap = ~16.6px total per week column
                        <span 
                            key={idx} 
                            className="month-label" 
                            style={{ left: `${label.wIndex * 16.6}px` }}
                        >
                            {label.text}
                        </span>
                    ))}
                </div>

                {/* Day grid */}
                <div className="grid-row-container">
                    {weeks.map((week, wIdx) => (
                        <div key={wIdx} className="calendar-week">
                            {week.map((day) => {
                                const count = day.count;
                                let lvlClass = 'lvl-0';
                                if (count === 1) lvlClass = 'lvl-1';
                                else if (count === 2) lvlClass = 'lvl-2';
                                else if (count >= 3) lvlClass = 'lvl-3';

                                return (
                                    <div 
                                        key={day.dateStr}
                                        className={`calendar-day ${lvlClass}`}
                                        data-tooltip={`${count} test${count !== 1 ? 's' : ''} completed on ${formatDateTooltip(day.dateStr)}`}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ContributionCalendar;
