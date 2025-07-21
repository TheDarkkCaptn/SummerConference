// src/UserProfile.jsx
import React, { useContext, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext.jsx';
import { Navigate, useNavigate } from 'react-router-dom';

const UserProfile = () => {
    const { user, logout } = useContext(AuthContext);
    const [joinRoomId, setJoinRoomId] = useState('');
   const navigate = useNavigate();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    const createRoom = () => {
        // создаём уникальный ID комнаты (например, случайный uuid)
        const roomId = Math.random().toString(36).substring(2, 10);
        navigate(`/room/${roomId}`);
    };

    const joinRoom = () => {
        if (joinRoomId.trim() !== '') {
        navigate(`/room/${joinRoomId.trim()}`);
        }
    };

    return (
        <div>
            <h2>User Profile</h2>
            <p>Username: {user.username}</p>
            <p>Email: {user.email}</p>
            <div style={{ marginTop: '20px' }}>
             <button onClick={createRoom}>Create Room</button>
            </div>
            <div style={{ marginTop: '10px' }}>
                <input 
                type="text" 
                placeholder="Enter Room ID" 
                value={joinRoomId} 
                onChange={e => setJoinRoomId(e.target.value)} 
                />
                <button onClick={joinRoom} style={{ marginLeft: '8px' }}>Join Room</button>
            </div>
            <button onClick={logout}>Logout</button>
        </div>
    );
};

export default UserProfile;