// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CreateBot from './pages/CreateBot';
import BotDetail from './pages/BotDetail';
import Chat from './pages/Chat';
import NotFound from './pages/NotFound';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout title="Dashboard">
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/bots/new"
            element={
              <ProtectedRoute>
                <Layout title="Create Bot">
                  <CreateBot />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/bots/:botId"
            element={
              <ProtectedRoute>
                <Layout title="Bot Detail">
                  <BotDetail />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/bots/:botId/chat"
            element={
              <ProtectedRoute>
                <Layout title="Chat Demo">
                  <Chat />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
