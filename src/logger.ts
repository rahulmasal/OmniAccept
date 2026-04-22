import * as vscode from 'vscode';
import { LogLevel } from './types';

/**
 * Singleton logger for the extension that writes to the Output Channel
 */
export class Logger {
    private static instance: Logger;
    private channel: vscode.OutputChannel;
    private logLevel: LogLevel = 'info';
    private isVisible: boolean = false;

    private constructor() {
        this.channel = vscode.window.createOutputChannel('Universal Auto Accept');
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Set the log level
     */
    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
        this.debug(`Log level set to: ${level}`);
    }

    /**
     * Get the current log level
     */
    public getLogLevel(): LogLevel {
        return this.logLevel;
    }

    /**
     * Show the output channel
     */
    public show(): void {
        this.channel.show();
        this.isVisible = true;
    }

    /**
     * Hide the output channel
     */
    public hide(): void {
        this.channel.hide();
        this.isVisible = false;
    }

    /**
     * Toggle visibility of the output channel
     */
    public toggle(): void {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Log a debug message
     */
    public debug(message: string, ...args: unknown[]): void {
        this.log('debug', message, args);
    }

    /**
     * Log an info message
     */
    public info(message: string, ...args: unknown[]): void {
        this.log('info', message, args);
    }

    /**
     * Log a warning message
     */
    public warn(message: string, ...args: unknown[]): void {
        this.log('warn', message, args);
    }

    /**
     * Log an error message
     */
    public error(message: string, ...args: unknown[]): void {
        this.log('error', message, args);
    }

    /**
     * Log a fatal/critical message
     */
    public fatal(message: string, ...args: unknown[]): void {
        this.log('error', `[FATAL] ${message}`, args);
    }

    /**
     * Internal log method
     */
    private log(level: LogLevel, message: string, args: unknown[]): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const timestamp = this.getTimestamp();
        const formattedArgs = args.length > 0 ? this.formatArgs(args) : '';
        const prefix = this.getPrefix(level);
        
        const fullMessage = `${timestamp} [${prefix}] ${message}${formattedArgs}`;
        this.channel.appendLine(fullMessage);
    }

    /**
     * Check if we should log at this level
     */
    private shouldLog(level: LogLevel): boolean {
        const levels: Record<LogLevel, number> = {
            'off': 0,
            'error': 1,
            'warn': 2,
            'info': 3,
            'debug': 4
        };

        const currentLevel = levels[this.logLevel];
        const messageLevel = levels[level];

        return messageLevel <= currentLevel;
    }

    /**
     * Get timestamp for log entry
     */
    private getTimestamp(): string {
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${pad(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    /**
     * Get prefix for log level
     */
    private getPrefix(level: LogLevel): string {
        const prefixes: Record<LogLevel, string> = {
            'debug': 'DBG',
            'info': 'INF',
            'warn': 'WRN',
            'error': 'ERR',
            'off': 'OFF'
        };
        return prefixes[level];
    }

    /**
     * Format additional arguments for logging
     */
    private formatArgs(args: unknown[]): string {
        if (args.length === 0) {
            return '';
        }

        const formatted = args.map(arg => {
            if (arg instanceof Error) {
                return `\n${arg.stack || arg.message}`;
            }
            if (typeof arg === 'object') {
                try {
                    return `\n${JSON.stringify(arg, null, 2)}`;
                } catch {
                    return `\n[Object]`;
                }
            }
            return String(arg);
        });

        return formatted.join(' ');
    }

    /**
     * Log section divider for readability
     */
    public section(title: string): void {
        this.info(`═══════════════════════════════════════════`);
        this.info(`  ${title}`);
        this.info(`═══════════════════════════════════════════`);
    }

    /**
     * Log a separator line
     */
    public separator(): void {
        this.info(`───────────────────────────────────────────`);
    }

    /**
     * Clear the output channel
     */
    public clear(): void {
        this.channel.clear();
    }

    /**
     * Dispose the logger
     */
    public dispose(): void {
        this.channel.dispose();
        // Use a type-safe way to allow instance reset for testing
        (Logger as unknown as { instance?: Logger }).instance = undefined;
    }
}

/**
 * Convenience function to get the logger instance
 */
export function getLogger(): Logger {
    return Logger.getInstance();
}

/**
 * Decorator for logging function entry/exit
 */
export function logOperation(operationName: string) {
    return function <T>(
        _target: unknown,
        _propertyKey: string,
        descriptor: TypedPropertyDescriptor<(...args: unknown[]) => T>
    ) {
        const originalMethod = descriptor.value;

        if (originalMethod) {
            descriptor.value = function (...args: unknown[]): T {
                const logger = getLogger();
                logger.debug(`Entering: ${operationName}`);
                const startTime = Date.now();

                try {
                    const result = originalMethod.apply(this, args);
                    
                    if (result instanceof Promise) {
                        return result
                            .then((value: T) => {
                                logger.debug(`${operationName} completed in ${Date.now() - startTime}ms`);
                                return value;
                            })
                            .catch((error: Error) => {
                                logger.error(`${operationName} failed: ${error.message}`);
                                throw error;
                            }) as T;
                    } else {
                        logger.debug(`${operationName} completed in ${Date.now() - startTime}ms`);
                        return result;
                    }
                } catch (error) {
                    logger.error(`${operationName} threw error: ${(error as Error).message}`);
                    throw error;
                }
            };
        }

        return descriptor;
    };
}