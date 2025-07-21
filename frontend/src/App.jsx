import React, { useContext } from 'react';
import {BrowserRouter as Router, Routes, Route, Link, Navigate} from 'react-router-dom';
import {AuthProvider, AuthContext} from './contexts/AuthContext.jsx';
import Register from './components/Register.jsx';
import Login from './components/Login.jsx';
import UserProfile from './components/UserProfile.jsx';
import Room from './components/Room.jsx';

const Navigation = () => {
    const { user } = useContext(AuthContext);
    
    return (
        <nav>
            <ul>
                {!user && (
                    <>
                        <li><Link to="/register">Register</Link></li>
                        <li><Link to="/login">Login</Link></li>
                    </>
                )}
                {user && (
                    <li><Link to="/profile">Profile</Link></li>
                )}
            </ul>
        </nav>
    );
};

const ProtectedRoute = ({ children }) => {
  const { user } = useContext(AuthContext);
  return user ? children : <Navigate to="/login" replace />;
};

const HiddenRoute = ({ children }) => {
  const { user } = useContext(AuthContext);
  return !user ? children : <Navigate to="/profile" replace />;
};

const App = () => {
    return (
        <Router>
            <AuthProvider>
                <div style={{"padding": "20px"}}>
                    <Navigation />
                    <Routes>
                        <Route path="/register" element={
                                <HiddenRoute>
                                    <Register />
                                </HiddenRoute>
                            } 
                        />
                        <Route path="/login" element={
                                <HiddenRoute>
                                    <Login />
                                </HiddenRoute>
                            } 
                        />
                        <Route 
                            path="/profile" 
                            element={
                                <ProtectedRoute>
                                    <UserProfile />
                                </ProtectedRoute>
                            } 
                        />
                        <Route
                            path="/room/:id"
                            element={
                                <ProtectedRoute>
                                    <Room />
                                </ProtectedRoute>
                         }
                       />
                        <Route 
                            path="*" 
                            element={<Navigate to="/login" replace />} 
                        />
                    </Routes>
                </div>
            </AuthProvider>
        </Router>
    );
};

export default App;