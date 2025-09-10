import { EventEmitter } from 'events';
import { Task, TaskResult, FlowType, FlowStatus } from '../types/index.js';

export interface FlowCapabilities {
  codeGeneration: boolean;
  codeReview: boolean;
  research: boolean;
  analysis: boolean;
  documentation: boolean;
  testing: boolean;
  refactoring: boolean;
  orchestration: boolean;
  hiveMind: boolean;
  swarmCoordination: boolean;
  mcp: boolean;
  webAuth: boolean;
}

export interface FlowAdapterConfig {
  enabled: boolean;
  priority: number;
  maxConcurrentTasks: number;
  timeout: number;
  retryAttempts: number;
  capabilities: FlowCapabilities;
  authConfig?: FlowAuthConfig;
  [key: string]: any;
}

export interface FlowAuthConfig {
  type: 'web' | 'api-key' | 'oauth';
  webUrl?: string;
  loginUrl?: string;
  apiKey?: string;
  oauthConfig?: {
    clientId: string;
    redirectUri: string;
    scope: string[];
  };
}

export interface FlowExecutionContext {
  taskId: string;
  sessionId?: string;
  userPreferences?: Record<string, any>;
  environmentVars?: Record<string, string>;
  workingDirectory?: string;
}

export abstract class BaseFlowAdapter extends EventEmitter {
  protected config: FlowAdapterConfig;
  protected status: FlowStatus = FlowStatus.OFFLINE;
  protected currentLoad = 0;
  protected authenticatedSession?: any;

  constructor(config: FlowAdapterConfig) {
    super();
    this.config = config;
  }

  // Abstract methods that each adapter must implement
  abstract get name(): string;
  abstract get type(): FlowType;
  abstract get version(): string;
  abstract initialize(): Promise<void>;
  abstract shutdown(): Promise<void>;
  abstract executeTask(task: Task, context?: FlowExecutionContext): Promise<TaskResult>;
  abstract checkHealth(): Promise<boolean>;
  abstract getCapabilities(): FlowCapabilities;

  // Authentication methods
  abstract authenticate(): Promise<boolean>;
  abstract isAuthenticated(): boolean;
  abstract getAuthUrl?(): string;

  // Common adapter functionality
  getStatus(): FlowStatus {
    return this.status;
  }

  getCurrentLoad(): number {
    return this.currentLoad;
  }

  getMaxLoad(): number {
    return this.config.maxConcurrentTasks;
  }

  canAcceptTask(): boolean {
    return this.status === FlowStatus.AVAILABLE && 
           this.currentLoad < this.config.maxConcurrentTasks;
  }

  protected setStatus(status: FlowStatus): void {
    const oldStatus = this.status;
    this.status = status;
    this.emit('status-changed', { 
      adapter: this.name, 
      oldStatus, 
      newStatus: status 
    });
  }

  protected incrementLoad(): void {
    this.currentLoad++;
    if (this.currentLoad >= this.config.maxConcurrentTasks) {
      this.setStatus(FlowStatus.BUSY);
    }
    this.emit('load-changed', { 
      adapter: this.name, 
      currentLoad: this.currentLoad,
      maxLoad: this.config.maxConcurrentTasks
    });
  }

  protected decrementLoad(): void {
    this.currentLoad = Math.max(0, this.currentLoad - 1);
    if (this.currentLoad < this.config.maxConcurrentTasks && this.status === FlowStatus.BUSY) {
      this.setStatus(FlowStatus.AVAILABLE);
    }
    this.emit('load-changed', { 
      adapter: this.name, 
      currentLoad: this.currentLoad,
      maxLoad: this.config.maxConcurrentTasks
    });
  }

  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    taskId: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        this.emit('execution-error', {
          adapter: this.name,
          taskId,
          attempt,
          error: error.message
        });

        if (attempt < this.config.retryAttempts) {
          // Exponential backoff
          const delay = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  protected createTaskResult(
    success: boolean,
    output?: string,
    error?: string,
    executionTime?: number,
    metadata?: Record<string, any>
  ): TaskResult {
    return {
      success,
      output,
      error,
      executedBy: this.name,
      executionTime: executionTime || 0,
      metadata: metadata || {}
    };
  }

  // Utility methods for common operations
  protected async openAuthUrl(url: string): Promise<void> {
    const { default: open } = await import('open');
    await open(url);
  }

  protected validateConfig(): void {
    if (!this.config) {
      throw new Error(`Configuration is required for ${this.name} adapter`);
    }
    
    if (this.config.maxConcurrentTasks <= 0) {
      throw new Error(`maxConcurrentTasks must be greater than 0 for ${this.name} adapter`);
    }

    if (this.config.timeout <= 0) {
      throw new Error(`timeout must be greater than 0 for ${this.name} adapter`);
    }
  }
}