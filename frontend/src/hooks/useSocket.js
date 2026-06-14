import { useEffect, useRef } from 'react';
import { getSocket, watchAccident, unwatchAccident } from '../api/socket';

/**
 * Custom React Hook to register and automatically clean up Socket.IO event listeners.
 * Uses a ref to ensure the handler is always fresh without re-binding the socket event on every render.
 * 
 * @param {string} eventName - Name of the event to listen to
 * @param {Function} handler - Event handler callback
 */
export const useSocketEvent = (eventName, handler) => {
  const handlerRef = useRef(handler);

  // Keep handler reference fresh
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!eventName) return undefined;
    const socket = getSocket();

    const listener = (...args) => {
      if (handlerRef.current) {
        handlerRef.current(...args);
      }
    };

    socket.on(eventName, listener);

    return () => {
      socket.off(eventName, listener);
    };
  }, [eventName]);
};

/**
 * Custom React Hook to watch a specific accident. Joins the corresponding accident room
 * and handles re-joining on socket reconnection automatically.
 * 
 * @param {string|number} accidentId - ID of the accident to track
 */
export const useAccidentWatch = (accidentId) => {
  useEffect(() => {
    if (!accidentId) return undefined;

    watchAccident(accidentId);

    return () => {
      unwatchAccident(accidentId);
    };
  }, [accidentId]);
};
