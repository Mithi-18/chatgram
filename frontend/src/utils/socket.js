import { io } from 'socket.io-client';

// Connect to local backend for testing
export const socket = io({
    autoConnect: false // Connect manually after auth
});
