import { io } from 'socket.io-client';

let socket = null;
let registration = null;

export const getSocket = () => {
  if (!socket) {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace('/api', '') || '/';
    socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
    socket.on('connect', () => {
      if (registration?.entityId && registration?.entityType) {
        socket.emit('entity:register', registration);
      }
    });
  }
  return socket;
};

export const connectSocket = (entityId, entityType) => {
  registration = { entityId, entityType };
  const s = getSocket();
  if (!s.connected) s.connect();
  else s.emit('entity:register', registration);
  return s;
};

export const disconnectSocket = () => {
  if (socket?.connected) socket.disconnect();
};

export default getSocket;
