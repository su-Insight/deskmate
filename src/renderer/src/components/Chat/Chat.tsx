// ============================================
// AI Chat Component
// ============================================

import React, { useState, useRef, useEffect } from 'react';
import { useAI } from '../../hooks';
import { formatDate, formatRelativeTime } from '../../utils';
import type { ChatMessage } from '../../types';
import './Chat.css';

interface ChatProps {
  compact?: boolean;
  sessionId?: string;
}

interface MessageBubbleProps {
  message: ChatMessage;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">
        <i className={`fas ${isUser ? 'fa-user' : 'fa-robot'}`}></i>
      </div>
      <div className="message-content">
        <div className="message-bubble">
          {message.content}
        </div>
        <div className="message-meta">
          <span className="message-time">{formatRelativeTime(message.timestamp)}</span>
        </div>
      </div>
    </div>
  );
};

const TypingIndicator: React.FC = () => (
  <div className="message assistant">
    <div className="message-avatar">
      <i className="fas fa-robot"></i>
    </div>
    <div className="message-content">
      <div className="message-bubble typing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  </div>
);

export const Chat: React.FC<ChatProps> = ({ compact = false, sessionId }) => {
  const { mode, isLoading, error, chat, setMode, clearError, messageRef } = useAI({ initialMode: 'private' });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`deskmate_chat_${sessionId || 'default'}`);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load chat history:', e);
      }
    } else {
      // Add welcome message
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: '你好！我是 DeskMate AI 助手。有什么我可以帮助你的吗？',
          timestamp: Date.now(),
        },
      ]);
    }
  }, [sessionId]);

  // Save chat history to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`deskmate_chat_${sessionId || 'default'}`, JSON.stringify(messages));
    }
  }, [messages, sessionId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    clearError();

    // Add loading indicator
    setMessages((prev) => [
      ...prev,
      {
        id: 'loading',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      },
    ]);

    const response = await chat(userMessage.content);

    // Remove loading indicator
    setMessages((prev) => prev.filter((m) => m.id !== 'loading'));

    if (response) {
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    if (confirm('确定要清空聊天记录吗？')) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: '聊天记录已清空。有什么我可以帮助你的吗？',
          timestamp: Date.now(),
        },
      ]);
    }
  };

  return (
    <div className={`chat-container ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="chat-header">
          <div className="chat-title">
            <i className="fas fa-robot"></i>
            <span>AI 助手</span>
          </div>
          <div className="chat-actions">
            <select
              className="mode-select"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'private' | 'incognito')}
            >
              <option value="private">连续对话</option>
              <option value="incognito">单次对话</option>
            </select>
            <button className="clear-btn" onClick={handleClearChat} title="清空聊天">
              <i className="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="chat-error">
          <i className="fas fa-exclamation-circle"></i>
          <span>{error}</span>
          <button onClick={clearError}>
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <textarea
          ref={messageRef}
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          rows={1}
          disabled={isLoading}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
        >
          <i className="fas fa-paper-plane"></i>
        </button>
      </div>
    </div>
  );
};

export default Chat;
