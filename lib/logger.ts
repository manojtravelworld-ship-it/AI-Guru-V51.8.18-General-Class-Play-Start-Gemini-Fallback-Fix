/**
 * Small dependency-free application logger.
 *
 * Kept intentionally compatible with both server and browser bundles so core
 * AI Guru modules can use the same logging surface without pulling a server
 * logger into client components.
 */
export interface AppLogger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

function write(level: 'debug' | 'info' | 'warn' | 'error', scope: string, args: unknown[]): void {
  const prefix = `[${scope}]`;
  if (level === 'error') console.error(prefix, ...args);
  else if (level === 'warn') console.warn(prefix, ...args);
  else if (level === 'debug') console.debug(prefix, ...args);
  else console.info(prefix, ...args);
}

export function createLogger(scope: string): AppLogger {
  return {
    debug: (...args) => write('debug', scope, args),
    info: (...args) => write('info', scope, args),
    warn: (...args) => write('warn', scope, args),
    error: (...args) => write('error', scope, args),
  };
}

export default createLogger;
