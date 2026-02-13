import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AIChatViewProps {
  messages: Message[];
  inputMessage: string;
  isTyping: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
}

export const AIChatView: React.FC<AIChatViewProps> = ({
  messages,
  inputMessage,
  isTyping,
  onInputChange,
  onSend,
  onKeyPress
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
      <header className="page-header" style={{ margin: '-20px -24px 20px -24px', padding: '16px 24px' }}>
        <div>
          <h1 className="page-title">AI Assistant</h1>
          <p className="page-subtitle">Your intelligent companion</p>
        </div>
      </header>

      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-robot" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}></i>
              <p>Start a conversation with AI</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '12px 16px',
                    borderRadius: '16px',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, #9D50BB, #6E48AA)'
                      : 'rgba(0, 0, 0, 0.05)',
                    color: msg.role === 'user' ? 'white' : 'var(--text-primary)'
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ node, inline, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline && match ? (
                            <SyntaxHighlighter
                              style={vscDarkPlus}
                              language={match[1]}
                              PreTag="div"
                              {...props}
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          ) : (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        }
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))
          )}
          {isTyping && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '16px' }}>
              <div style={{ padding: '12px 16px', borderRadius: '16px', background: 'rgba(0, 0, 0, 0.05)' }}>
                <i className="fa-solid fa-circle-notch fa-spin"></i>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid rgba(0, 0, 0, 0.08)' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyPress={onKeyPress}
              placeholder="Type a message..."
              style={{
                flex: 1,
                padding: '12px 16px',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                borderRadius: '12px',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <button
              onClick={onSend}
              disabled={isTyping || !inputMessage.trim()}
              style={{
                padding: '12px 20px',
                background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: isTyping || !inputMessage.trim() ? 'not-allowed' : 'pointer',
                opacity: isTyping || !inputMessage.trim() ? 0.6 : 1
              }}
            >
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
