import { io } from 'socket.io-client';

// Connect to local backend for testing
export const socket = io('http://localhost:5000', {
    autoConnect: false // Connect manually after auth
});
