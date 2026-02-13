import React, { useState } from 'react';

export const CalendarView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const renderDays = () => {
    const days = [];
    const today = new Date();

    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} style={{ padding: '12px' }}></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = 
        day === today.getDate() &&
        currentDate.getMonth() === today.getMonth() &&
        currentDate.getFullYear() === today.getFullYear();

      days.push(
        <div
          key={day}
          style={{
            padding: '12px',
            textAlign: 'center',
            borderRadius: '8px',
            background: isToday ? 'linear-gradient(135deg, #9D50BB, #6E48AA)' : 'transparent',
            color: isToday ? 'white' : 'var(--text-primary)',
            fontWeight: isToday ? 600 : 400,
            cursor: 'pointer'
          }}
        >
          {day}
        </div>
      );
    }

    return days;
  };

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-subtitle">Manage your schedule</p>
        </div>
      </header>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div onClick={prevMonth} style={{ cursor: 'pointer', padding: '8px' }}>
            <i className="fa-solid fa-chevron-left"></i>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 600 }}>
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </div>
          <div onClick={nextMonth} style={{ cursor: 'pointer', padding: '8px' }}>
            <i className="fa-solid fa-chevron-right"></i>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {dayNames.map((day) => (
            <div
              key={day}
              style={{
                padding: '12px',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)'
              }}
            >
              {day}
            </div>
          ))}
          {renderDays()}
        </div>
      </div>
    </div>
  );
};
