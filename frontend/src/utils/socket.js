import { io } from 'socket.io-client';

// Connect to local backend for testing
export const socket = io('https://chatgram-production.up.railway.app', {
    autoConnect: false // Connect manually after auth
});
