/**
 * socketStore.ts — DEPRECATED / STUB
 *
 * Socket.IO has been replaced by EMQX MQTT for realtime messaging.
 * This file is kept as a no-op stub to avoid import errors from any
 * residual references. Safe to delete when all imports are confirmed clean.
 */

export function setIO(_io: any): void {
  // no-op — Socket.IO removed; EMQX MQTT is now the realtime layer
}

export function getIO(): null {
  return null;
}
