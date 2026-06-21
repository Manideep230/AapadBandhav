function redact(data: any): any {
  if (typeof data === 'string') {
    // Redact 6-digit OTPs
    let sanitized = data.replace(/\b\d{6}\b/g, '[REDACTED_OTP]');
    // Redact JWT tokens (Bearer eyJ...)
    sanitized = sanitized.replace(/\beyJhbGciOi[a-zA-Z0-9-_=]+\.[a-zA-Z0-9-_=]+\.?[a-zA-Z0-9-_=]*\b/g, '[REDACTED_JWT]');
    // Redact email addresses
    sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g, '[REDACTED_EMAIL]');
    return sanitized;
  }
  
  if (data && typeof data === 'object') {
    try {
      // Create a deep copy to prevent mutating the original application state
      const copy = JSON.parse(JSON.stringify(data));
      const redactObject = (obj: any) => {
        const sensitiveKeys = ['otp', 'password', 'token', 'jwt', 'otphash', 'mobile', 'email', 'fcmtoken', 'passcode'];
        for (const key in obj) {
          if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
            obj[key] = '[REDACTED]';
          } else if (obj[key] && typeof obj[key] === 'object') {
            redactObject(obj[key]);
          }
        }
      };
      redactObject(copy);
      return copy;
    } catch {
      return '[REDACTED_OBJECT]';
    }
  }
  return data;
}

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(`ℹ️ [INFO] ${redact(message)}`, ...args.map(redact));
  },
  error: (message: string, error?: any, ...args: any[]) => {
    console.error(`❌ [ERROR] ${redact(message)}`, redact(error) || '', ...args.map(redact));
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`⚠️ [WARN] ${redact(message)}`, ...args.map(redact));
  },
  debug: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔍 [DEBUG] ${redact(message)}`, ...args.map(redact));
    }
  }
};
