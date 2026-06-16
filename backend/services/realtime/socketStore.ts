import { Server } from 'socket.io';

let ioInstance: Server | null = null;

export function setIO(io: Server) {
  ioInstance = io;
}

export function getIO(): Server | null {
  return ioInstance;
}
