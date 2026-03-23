import { useState, useEffect } from 'react';
import Login from './components/Login';
import Chat from './components/Chat';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));

  useEffect(() => {
    if (token && currentUser) {
      // If we already have token, we stay logged in
    }
  }, [token, currentUser]);

  const handleLogin = (user, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setToken(token);
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setCurrentUser(null);
  };

  if (!token || !currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return <Chat currentUser={currentUser} onLogout={handleLogout} />;
}

export default App;
