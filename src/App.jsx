import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ExamProvider } from './context/ExamContext';
import { RoomProvider } from './context/RoomContext';
import Setup from './pages/Setup';
import Test from './pages/Test';
import Results from './pages/Results';
import Lobby from './pages/Lobby';
import SavedExams from './pages/SavedExams';
import Leaderboard from './pages/Leaderboard';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Settings from './pages/Settings';
import GlobalLeaderboard from './pages/GlobalLeaderboard';
import QuestionBank from './pages/QuestionBank';
import MockBuilder from './pages/MockBuilder';
import AIGenerator from './pages/AIGenerator';
import Friends from './pages/Friends';
import AdminPanel from './pages/AdminPanel';
import Profile from './pages/Profile';
import Documents from './pages/Documents';
import './App.css';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;
  if (!isAuthenticated) {
    // Save intended destination (e.g. /lobby?room=CODE) so Login can redirect back
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Setup /></ProtectedRoute>} />
      <Route path="/test" element={<ProtectedRoute><Test /></ProtectedRoute>} />
      <Route path="/results" element={<ProtectedRoute><Results /></ProtectedRoute>} />
      <Route path="/lobby" element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
      <Route path="/saved" element={<ProtectedRoute><SavedExams /></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/global-leaderboard" element={<ProtectedRoute><GlobalLeaderboard /></ProtectedRoute>} />
      <Route path="/question-bank" element={<ProtectedRoute><QuestionBank /></ProtectedRoute>} />
      <Route path="/mock-builder" element={<ProtectedRoute><MockBuilder /></ProtectedRoute>} />
      <Route path="/ai-generator" element={<ProtectedRoute><AIGenerator /></ProtectedRoute>} />
      <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <ExamProvider>
        <RoomProvider>
          <Router>
            <AppRoutes />
          </Router>
        </RoomProvider>
      </ExamProvider>
    </AuthProvider>
  );
}

export default App;
