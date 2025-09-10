import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';

export class Logger {
  private winston: WinstonLogger;
  private context: string;

  constructor(context: string = 'NexusFlow') {
    this.context = context;
    
    this.winston = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: format.combine(
        format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        format.errors({ stack: true }),
        format.json()
      ),
      defaultMeta: { context: this.context },
      transports: [
        new transports.File({ 
          filename: 'logs/error.log', 
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        new transports.File({ 
          filename: 'logs/combined.log',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        })
      ]
    });

    // Add console transport for non-production
    if (process.env.NODE_ENV !== 'production') {
      this.winston.add(new transports.Console({
        format: format.combine(
          format.colorize(),
          format.simple(),
          format.printf(({ timestamp, level, message, context, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${context}] ${level}: ${message} ${metaStr}`;
          })
        )
      }));
    }
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
  }

  error(message: string, error?: Error | any, meta?: any): void {
    if (error instanceof Error) {
      this.winston.error(message, { error: error.stack, ...meta });
    } else if (error) {
      this.winston.error(message, { error, ...meta });
    } else {
      this.winston.error(message, meta);
    }
  }

  setLevel(level: string): void {
    this.winston.level = level;
  }

  child(childContext: string): Logger {
    return new Logger(`${this.context}:${childContext}`);
  }
}