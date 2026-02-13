import React, { useState, useEffect } from 'react';

interface Task {
  id: number;
  content: string;
  status: number;
  priority: number;
  due_date?: number;
  created_at: number;
}

function getServerUrl(path: string): string {
  if (typeof window !== 'undefined' && (window as any).deskmate) {
    return `http://127.0.0.1:5000${path}`;
  }
  return path;
}

export const TasksView: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    try {
      const res = await fetch(getServerUrl('/api/tasks'));
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error('获取任务失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    try {
      const res = await fetch(getServerUrl('/api/tasks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newTask, priority: 1 })
      });
      const data = await res.json();
      if (data.success) {
        setNewTask('');
        fetchTasks();
      }
    } catch (err) {
      console.error('添加任务失败:', err);
    }
  };

  const toggleTask = async (id: number, currentStatus: number) => {
    try {
      const res = await fetch(getServerUrl(`/api/tasks/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: currentStatus === 0 ? 1 : 0 })
      });
      const data = await res.json();
      if (data.success) {
        fetchTasks();
      }
    } catch (err) {
      console.error('更新任务失败:', err);
    }
  };

  const deleteTask = async (id: number) => {
    try {
      const res = await fetch(getServerUrl(`/api/tasks/${id}`), { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchTasks();
      }
    } catch (err) {
      console.error('删除任务失败:', err);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">Manage your to-do items</p>
        </div>
      </header>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addTask()}
            placeholder="Add a new task..."
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
            onClick={addTask}
            style={{
              padding: '12px 20px',
              background: 'linear-gradient(135deg, #9D50BB, #6E48AA)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer'
            }}
          >
            <i className="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-circle-notch fa-spin"></i>
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No tasks yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: task.status === 1 ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                  textDecoration: task.status === 1 ? 'line-through' : 'none',
                  opacity: task.status === 1 ? 0.6 : 1
                }}
              >
                <div
                  onClick={() => toggleTask(task.id, task.status)}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: `2px solid ${task.status === 1 ? '#10B981' : 'var(--text-muted)'}`,
                    background: task.status === 1 ? '#10B981' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {task.status === 1 && (
                    <i className="fa-solid fa-check" style={{ color: 'white', fontSize: '10px' }}></i>
                  )}
                </div>
                <span style={{ flex: 1 }}>{task.content}</span>
                <div
                  onClick={() => deleteTask(task.id)}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#EF4444',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <i className="fa-solid fa-trash" style={{ fontSize: '12px' }}></i>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
