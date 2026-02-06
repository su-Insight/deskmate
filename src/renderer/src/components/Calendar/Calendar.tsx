// ============================================
// Calendar Component
// ============================================

import React, { useState } from 'react';
import './Calendar.css';

export const Calendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
    });
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const isToday = (day: number): boolean => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const days: (number | null)[] = [];

  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <h2><i className="fas fa-calendar-alt"></i> 日历</h2>
        <div className="calendar-nav">
          <button onClick={prevMonth}>
            <i className="fas fa-chevron-left"></i>
          </button>
          <span className="current-month">{formatDate(currentDate)}</span>
          <button onClick={nextMonth}>
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>

      <div className="calendar-grid">
        <div className="calendar-weekdays">
          {weekDays.map((day) => (
            <div key={day} className="weekday">{day}</div>
          ))}
        </div>

        <div className="calendar-days">
          {days.map((day, index) => (
            <div
              key={index}
              className={`calendar-day ${day === null ? 'empty' : ''} ${day && isToday(day) ? 'today' : ''}`}
            >
              {day}
            </div>
          ))}
        </div>
      </div>

      <div className="calendar-footer">
        <div className="today-info">
          <i className="fas fa-clock"></i>
          <span>今天: {new Date().toLocaleDateString('zh-CN')}</span>
        </div>
      </div>
    </div>
  );
};

export default Calendar;
