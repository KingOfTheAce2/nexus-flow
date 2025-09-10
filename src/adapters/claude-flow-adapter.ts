import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { BaseFlowAdapter, FlowAdapterConfig, FlowCapabilities, FlowExecutionContext } from './base-flow-adapter.js';
import { Task, TaskResult, FlowType, FlowStatus } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export interface ClaudeFlowConfig extends FlowAdapterConfig {
  claudeFlowPath?: string;
  useHiveMind: boolean;
  swarmConfig?: {
    maxAgents: number;
    topology: 'hierarchical' | 'mesh' | 'adaptive' | 'collective-intelligence';
    consensus: 'majority' | 'weighted' | 'byzantine';
  };
  mcpConfig?: {
    enabled: boolean;
    tools: string[];
  };
}

export class ClaudeFlowAdapter extends BaseFlowAdapter {
  private logger: Logger;
  private claudeFlowPath: string;
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private mcpSession?: any;

  constructor(config: ClaudeFlowConfig) {
    super(config);
    this.logger = new Logger('ClaudeFlowAdapter');
    this.claudeFlowPath = config.claudeFlowPath || 'claude-flow';
    this.validateConfig();
  }

  get name(): string {
    return 'claude-flow';
  }

  get type(): FlowType {
    return FlowType.CLAUDE;
  }

  get version(): string {
    return '2.0.0-alpha.90';
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Claude Flow adapter...');
    
    try {
      // Check if claude-flow is available
      const isAvailable = await this.checkClaudeFlowAvailability();
      if (!isAvailable) {
        throw new Error('Claude Flow is not available. Please install claude-flow.');
      }

      // Initialize MCP if enabled
      if ((this.config as ClaudeFlowConfig).mcpConfig?.enabled) {
        await this.initializeMCP();
      }

      this.setStatus(FlowStatus.AVAILABLE);
      this.logger.info('Claude Flow adapter initialized successfully');

    } catch (error: any) {
      this.logger.error('Failed to initialize Claude Flow adapter:', error);
      this.setStatus(FlowStatus.ERROR);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Claude Flow adapter...');
    
    // Terminate all active processes
    for (const [taskId, process] of this.activeProcesses.entries()) {
      this.logger.debug(`Terminating process for task: ${taskId}`);
      process.kill('SIGTERM');
    }
    this.activeProcesses.clear();

    // Shutdown MCP session
    if (this.mcpSession) {
      await this.shutdownMCP();
    }

    this.setStatus(FlowStatus.OFFLINE);
    this.logger.info('Claude Flow adapter shutdown complete');
  }

  async executeTask(task: Task, context?: FlowExecutionContext): Promise<TaskResult> {
    if (!this.canAcceptTask()) {
      throw new Error(`Claude Flow adapter cannot accept task: status=${this.status}, load=${this.currentLoad}/${this.getMaxLoad()}`);
    }

    this.incrementLoad();
    const startTime = Date.now();

    try {
      const config = this.config as ClaudeFlowConfig;
      let result: TaskResult;

      if (config.useHiveMind && this.supportsHiveMind(task)) {
        result = await this.executeWithHiveMind(task, context);
      } else {
        result = await this.executeWithStandardFlow(task, context);
      }

      const executionTime = Date.now() - startTime;
      result.executionTime = executionTime;

      this.logger.info(`Task completed: ${task.id} in ${executionTime}ms`);
      return result;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      this.logger.error(`Task failed: ${task.id} - ${error.message}`);
      
      return this.createTaskResult(
        false,
        undefined,
        error.message,
        executionTime,
        { errorType: error.constructor.name }
      );
    } finally {
      this.decrementLoad();
      this.activeProcesses.delete(task.id);
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const result = await this.runClaudeFlowCommand(['--version'], 5000);
      return result.success;
    } catch {
      return false;
    }
  }

  getCapabilities(): FlowCapabilities {
    return {
      codeGeneration: true,
      codeReview: true,
      research: true,
      analysis: true,
      documentation: true,
      testing: true,
      refactoring: true,
      orchestration: true,
      hiveMind: true,
      swarmCoordination: true,
      mcp: true,
      webAuth: true
    };
  }

  async authenticate(): Promise<boolean> {
    // For Claude Flow, web authentication through claude.ai
    if (this.config.authConfig?.type === 'web') {
      const authUrl = this.getAuthUrl();
      if (authUrl) {
        this.logger.info('Opening Claude authentication URL...');
        await this.openAuthUrl(authUrl);
        
        // Wait for user to complete authentication
        // In a real implementation, this would involve checking session status
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      }
    }
    
    // Default to assuming authentication through environment or existing session
    return true;
  }

  isAuthenticated(): boolean {
    // Check if Claude session is available
    // In practice, this would check for valid session tokens or API keys
    return process.env.ANTHROPIC_API_KEY !== undefined || this.authenticatedSession !== undefined;
  }

  getAuthUrl(): string {
    return 'https://claude.ai/login';
  }

  private async checkClaudeFlowAvailability(): Promise<boolean> {
    try {
      const result = await this.runClaudeFlowCommand(['--version'], 5000);
      return result.success;
    } catch {
      return false;
    }
  }

  private async initializeMCP(): Promise<void> {
    this.logger.debug('Initializing MCP session...');
    // Initialize MCP connection for tool orchestration
    // This would connect to the MCP server provided by claude-flow
  }

  private async shutdownMCP(): Promise<void> {
    this.logger.debug('Shutting down MCP session...');
    // Close MCP connection
  }

  private supportsHiveMind(task: Task): boolean {
    // Complex tasks benefit from hive-mind coordination
    const complexTypes = ['orchestration', 'research', 'analysis'];
    return complexTypes.includes(task.type) || 
           task.description.length > 200 ||
           task.metadata?.complexity === 'high';
  }

  private async executeWithHiveMind(task: Task, context?: FlowExecutionContext): Promise<TaskResult> {
    this.logger.debug(`Executing task with hive-mind: ${task.id}`);
    
    const config = this.config as ClaudeFlowConfig;
    const swarmConfig = config.swarmConfig;
    
    const args = [
      'hive-mind', 'spawn',
      `"${task.description}"`,
      '--topology', swarmConfig?.topology || 'adaptive',
      '--consensus', swarmConfig?.consensus || 'majority',
      '--max-agents', String(swarmConfig?.maxAgents || 4),
      '--auto-execute'
    ];

    if (context?.sessionId) {
      args.push('--session-id', context.sessionId);
    }

    return await this.runClaudeFlowCommand(args, this.config.timeout);
  }

  private async executeWithStandardFlow(task: Task, context?: FlowExecutionContext): Promise<TaskResult> {
    this.logger.debug(`Executing task with standard flow: ${task.id}`);
    
    // Determine the appropriate SPARC mode based on task type
    const mode = this.getSPARCMode(task);
    
    const args = [
      'sparc', 'run', mode,
      `"${task.description}"`
    ];

    if (context?.workingDirectory) {
      args.push('--cwd', context.workingDirectory);
    }

    return await this.runClaudeFlowCommand(args, this.config.timeout);
  }

  private getSPARCMode(task: Task): string {
    const modeMap: Record<string, string> = {
      'code-generation': 'coder',
      'code-review': 'reviewer',
      'research': 'researcher',
      'analysis': 'planner',
      'documentation': 'api-docs',
      'testing': 'tester',
      'refactoring': 'coder',
      'orchestration': 'system-architect'
    };

    return modeMap[task.type] || 'coder';
  }

  private async runClaudeFlowCommand(args: string[], timeout: number): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.claudeFlowPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);

      process.on('close', (code) => {
        clearTimeout(timeoutId);
        
        const success = code === 0;
        resolve(this.createTaskResult(
          success,
          success ? stdout : undefined,
          success ? undefined : stderr || `Process exited with code ${code}`,
          undefined,
          { exitCode: code }
        ));
      });

      process.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  protected validateConfig(): void {
    super.validateConfig();
    
    const config = this.config as ClaudeFlowConfig;
    
    if (config.swarmConfig) {
      if (config.swarmConfig.maxAgents <= 0) {
        throw new Error('swarmConfig.maxAgents must be greater than 0');
      }
    }
  }
}