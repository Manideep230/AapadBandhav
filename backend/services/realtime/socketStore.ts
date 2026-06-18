/**
 * socketStore.ts — DEPRECATED
 *
 * This file previously stored a global Socket.IO server instance.
 * Socket.IO has been removed in favour of EMQX MQTT for realtime messaging.
 *
 * Kept as an empty stub to avoid any residual import errors.
 * Safe to delete once all imports of this file are confirmed removed.
 */

export function setIO(_io: any): void {
  // no-op — Socket.IO removed
}

export function getIO(): null {
  return null;
}
