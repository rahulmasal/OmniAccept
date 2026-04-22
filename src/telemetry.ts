import * as vscode from "vscode";
import { TelemetryEvent } from "./types";
import { getLogger } from "./logger";
import { getSettings } from "./settings";

/**
 * Opt-in telemetry system that respects VS Code's telemetry setting
 * Only collects anonymous usage data — no file paths, content, or personal info
 */
export class TelemetryService implements vscode.Disposable {
  private static instance: TelemetryService;
  private enabled: boolean = false;
  private disposables: vscode.Disposable[] = [];
  private eventQueue: QueuedEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly flushIntervalMs = 30000; // Flush every 30 seconds

  private constructor() {}

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  /**
   * Initialize telemetry service
   */
  public initialize(): void {
    const settings = getSettings();
    this.enabled = settings.enableTelemetry;

    // Listen for settings changes
    settings.onDidChange(() => {
      this.enabled = getSettings().enableTelemetry;
    });

    // Start flush timer
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);

    getLogger().info(`Telemetry initialized (enabled: ${this.enabled})`);
  }

  /**
   * Send a telemetry event
   */
  public sendEvent(
    event: TelemetryEvent,
    properties?: Record<string, string>,
    measurements?: Record<string, number>,
  ): void {
    if (!this.enabled) {
      return;
    }

    // Sanitize properties — remove any file paths or content
    const sanitizedProperties = this.sanitizeProperties(properties);

    this.eventQueue.push({
      event,
      properties: sanitizedProperties,
      measurements,
      timestamp: new Date(),
    });

    getLogger().debug(`Telemetry event queued: ${event}`);
  }

  /**
   * Sanitize properties to remove potentially sensitive data
   */
  private sanitizeProperties(
    properties?: Record<string, string>,
  ): Record<string, string> | undefined {
    if (!properties) {
      return undefined;
    }

    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(properties)) {
      // Don't include file paths or content
      if (
        key.toLowerCase().includes("path") ||
        key.toLowerCase().includes("file") ||
        key.toLowerCase().includes("content") ||
        key.toLowerCase().includes("token") ||
        key.toLowerCase().includes("secret")
      ) {
        continue;
      }
      sanitized[key] = value;
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  /**
   * Flush queued events
   */
  private flush(): void {
    if (this.eventQueue.length === 0) {
      return;
    }

    const logger = getLogger();
    const count = this.eventQueue.length;
    logger.debug(`Flushing ${count} telemetry events`);

    // In a production implementation, this would send to a telemetry endpoint
    // For now, we log the aggregate counts
    const eventCounts: Record<string, number> = {};
    for (const queued of this.eventQueue) {
      eventCounts[queued.event] = (eventCounts[queued.event] || 0) + 1;
    }

    logger.debug(`Telemetry flush: ${JSON.stringify(eventCounts)}`);
    this.eventQueue = [];
  }

  /**
   * Check if telemetry is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Set telemetry enabled state
   */
  public setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) {
      this.eventQueue = [];
    }
  }

  public dispose(): void {
    this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.disposables.forEach((d) => d.dispose());
  }
}

interface QueuedEvent {
  event: TelemetryEvent;
  properties?: Record<string, string>;
  measurements?: Record<string, number>;
  timestamp: Date;
}

/**
 * Get the TelemetryService singleton
 */
export function getTelemetry(): TelemetryService {
  return TelemetryService.getInstance();
}
