import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

let logger: winston.Logger | null = null;
let logFilePath: string = '';
let isClosed: boolean = false;

export function getLogger(): winston.Logger & { getLogFile: () => string } {
  if (!logger) {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    logFilePath = path.join(logsDir, `app-${timestamp}.log`);

    logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: logFilePath }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    }) as winston.Logger & { getLogFile: () => string };

    // Add method to get log file path
    (logger as any).getLogFile = () => logFilePath;

    logger.info('Logger initialized');
  }

  return logger as winston.Logger & { getLogFile: () => string };
}

export function closeLogger(): void {
  if (logger) {
    isClosed = true;
    logger.end();
    logger = null;
  }
}

export function isLoggerClosed(): boolean {
  return isClosed;
}

export default getLogger();
