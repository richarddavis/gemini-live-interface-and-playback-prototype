import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState({ title: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/tasks`);
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      const data = await response.json();
      setTasks(data);
      setError(null);
    } catch (err) {
      setError('Failed to load tasks. Backend might not be running.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewTask({
      ...newTask,
      [name]: value
    });
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.title) return;
    
    try {
      const response = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTask),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add task');
      }
      
      const addedTask = await response.json();
      setTasks([...tasks, addedTask]);
      setNewTask({ title: '', description: '' });
    } catch (err) {
      setError('Failed to add task');
      console.error(err);
    }
  };

  const handleToggleComplete = async (id, currentStatus) => {
    try {
      const response = await fetch(`${API_URL}/tasks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed: !currentStatus }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update task');
      }
      
      setTasks(tasks.map(task => 
        task.id === id ? { ...task, completed: !task.completed } : task
      ));
    } catch (err) {
      setError('Failed to update task');
      console.error(err);
    }
  };

  const handleDeleteTask = async (id) => {
    try {
      const response = await fetch(`${API_URL}/tasks/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete task');
      }
      
      setTasks(tasks.filter(task => task.id !== id));
    } catch (err) {
      setError('Failed to delete task');
      console.error(err);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Task Manager</h1>
        <p>Full Stack Starter App (React + Flask + PostgreSQL)</p>
      </header>
      
      <main>
        <section className="task-form-container">
          <h2>Add New Task</h2>
          <form onSubmit={handleAddTask}>
            <div className="form-group">
              <label htmlFor="title">Title:</label>
              <input
                type="text"
                id="title"
                name="title"
                value={newTask.title}
                onChange={handleInputChange}
                placeholder="Task title"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="description">Description:</label>
              <textarea
                id="description"
                name="description"
                value={newTask.description}
                onChange={handleInputChange}
                placeholder="Task description"
              />
            </div>
            
            <button type="submit">Add Task</button>
          </form>
        </section>
        
        <section className="tasks-container">
          <h2>Tasks</h2>
          {error && <div className="error-message">{error}</div>}
          {loading ? (
            <p>Loading tasks...</p>
          ) : tasks.length > 0 ? (
            <ul className="task-list">
              {tasks.map(task => (
                <li key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
                  <div className="task-content">
                    <h3>{task.title}</h3>
                    <p>{task.description}</p>
                  </div>
                  <div className="task-actions">
                    <button 
                      onClick={() => handleToggleComplete(task.id, task.completed)}
                      className="toggle-btn"
                    >
                      {task.completed ? 'Mark Incomplete' : 'Mark Complete'}
                    </button>
                    <button 
                      onClick={() => handleDeleteTask(task.id)}
                      className="delete-btn"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No tasks yet. Add your first task above!</p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
