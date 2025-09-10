import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { BaseFlowAdapter, FlowAdapterConfig, FlowCapabilities, FlowExecutionContext } from './base-flow-adapter.js';
import { Task, TaskResult, FlowType, FlowStatus } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export interface GeminiFlowConfig extends FlowAdapterConfig {
  geminiFlowPath?: string;
  googleServices?: {
    vertexAI: boolean;
    veo3: boolean;
    imagen4: boolean;
    lyria: boolean;
    chirp: boolean;
    coScientist: boolean;
    mariner: boolean;
    agentSpace: boolean;
  };
  a2aConfig?: {
    enabled: boolean;
    transport: 'websocket' | 'http' | 'grpc';
    encryption: boolean;
  };
  performanceConfig?: {
    sqliteOptimization: boolean;
    memoryPoolSize: number;
    concurrencyLevel: number;
  };
}

export class GeminiFlowAdapter extends BaseFlowAdapter {
  private logger: Logger;
  private geminiFlowPath: string;
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private a2aSession?: any;
  private agentSpaceManager?: any;

  constructor(config: GeminiFlowConfig) {
    super(config);
    this.logger = new Logger('GeminiFlowAdapter');
    this.geminiFlowPath = config.geminiFlowPath || 'gemini-flow';
    this.validateConfig();
  }

  get name(): string {
    return 'gemini-flow';
  }

  get type(): FlowType {
    return FlowType.GEMINI;
  }

  get version(): string {
    return '1.3.2';
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Gemini Flow adapter...');
    
    try {
      // Check if gemini-flow is available
      const isAvailable = await this.checkGeminiFlowAvailability();
      if (!isAvailable) {
        throw new Error('Gemini Flow is not available. Please install gemini-flow.');
      }

      // Initialize A2A if enabled
      const config = this.config as GeminiFlowConfig;
      if (config.a2aConfig?.enabled) {
        await this.initializeA2A();
      }

      // Initialize AgentSpace if configured
      if (config.googleServices?.agentSpace) {
        await this.initializeAgentSpace();
      }

      this.setStatus(FlowStatus.AVAILABLE);
      this.logger.info('Gemini Flow adapter initialized successfully');

    } catch (error: any) {
      this.logger.error('Failed to initialize Gemini Flow adapter:', error);
      this.setStatus(FlowStatus.ERROR);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Gemini Flow adapter...');
    
    // Terminate all active processes
    for (const [taskId, process] of this.activeProcesses.entries()) {
      this.logger.debug(`Terminating process for task: ${taskId}`);
      process.kill('SIGTERM');
    }
    this.activeProcesses.clear();

    // Shutdown A2A session
    if (this.a2aSession) {
      await this.shutdownA2A();
    }

    // Shutdown AgentSpace
    if (this.agentSpaceManager) {
      await this.shutdownAgentSpace();
    }

    this.setStatus(FlowStatus.OFFLINE);
    this.logger.info('Gemini Flow adapter shutdown complete');
  }

  async executeTask(task: Task, context?: FlowExecutionContext): Promise<TaskResult> {
    if (!this.canAcceptTask()) {
      throw new Error(`Gemini Flow adapter cannot accept task: status=${this.status}, load=${this.currentLoad}/${this.getMaxLoad()}`);
    }

    this.incrementLoad();
    const startTime = Date.now();

    try {
      const config = this.config as GeminiFlowConfig;
      let result: TaskResult;

      if (config.googleServices?.agentSpace && this.supportsAgentSpace(task)) {
        result = await this.executeWithAgentSpace(task, context);
      } else if (config.a2aConfig?.enabled && this.supportsA2A(task)) {
        result = await this.executeWithA2A(task, context);
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
      const result = await this.runGeminiFlowCommand(['--version'], 5000);
      return result.success;
    } catch {
      return false;
    }
  }

  getCapabilities(): FlowCapabilities {
    const config = this.config as GeminiFlowConfig;
    
    return {
      codeGeneration: true,
      codeReview: true,
      research: true,
      analysis: true,
      documentation: true,
      testing: true,
      refactoring: true,
      orchestration: config.a2aConfig?.enabled || false,
      hiveMind: false, // Gemini Flow uses AgentSpace instead
      swarmCoordination: config.a2aConfig?.enabled || false,
      mcp: true,
      webAuth: true
    };
  }

  async authenticate(): Promise<boolean> {
    // For Gemini Flow, web authentication through Google AI Studio
    if (this.config.authConfig?.type === 'web') {
      const authUrl = this.getAuthUrl();
      if (authUrl) {
        this.logger.info('Opening Google AI Studio authentication URL...');
        await this.openAuthUrl(authUrl);
        
        // Wait for user to complete authentication
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      }
    }
    
    // Default to assuming authentication through environment or existing session
    return true;
  }

  isAuthenticated(): boolean {
    // Check if Google AI/Vertex AI session is available
    return process.env.GOOGLE_AI_API_KEY !== undefined || 
           process.env.GOOGLE_APPLICATION_CREDENTIALS !== undefined ||
           this.authenticatedSession !== undefined;
  }

  getAuthUrl(): string {
    return 'https://aistudio.google.com/apikey';
  }

  private async checkGeminiFlowAvailability(): Promise<boolean> {
    try {
      const result = await this.runGeminiFlowCommand(['--version'], 5000);
      return result.success;
    } catch {
      return false;
    }
  }

  private async initializeA2A(): Promise<void> {
    this.logger.debug('Initializing A2A session...');
    // Initialize Agent-to-Agent communication protocol
    // This would set up the transport layer and encryption
  }

  private async shutdownA2A(): Promise<void> {
    this.logger.debug('Shutting down A2A session...');
    // Close A2A connections
  }

  private async initializeAgentSpace(): Promise<void> {
    this.logger.debug('Initializing AgentSpace...');
    // Initialize Google AgentSpace for spatial reasoning and coordination
  }

  private async shutdownAgentSpace(): Promise<void> {
    this.logger.debug('Shutting down AgentSpace...');
    // Close AgentSpace connections
  }

  private supportsAgentSpace(task: Task): boolean {
    // Tasks that benefit from spatial reasoning and Google services
    const spatialTypes = ['research', 'analysis', 'orchestration'];
    return spatialTypes.includes(task.type) || 
           task.metadata?.requiresMultiModal === true ||
           task.metadata?.complexity === 'high';
  }

  private supportsA2A(task: Task): boolean {
    // Tasks that benefit from agent-to-agent coordination
    return task.type === 'orchestration' || 
           task.metadata?.requiresMultiAgent === true;
  }

  private async executeWithAgentSpace(task: Task, context?: FlowExecutionContext): Promise<TaskResult> {
    this.logger.debug(`Executing task with AgentSpace: ${task.id}`);
    
    const args = [
      'agentspace', 'execute',
      `"${task.description}"`,
      '--agents', '8', // Use 8 specialized agents
      '--consensus', 'byzantine',
      '--spatial-reasoning'
    ];

    if (context?.sessionId) {
      args.push('--session-id', context.sessionId);
    }

    // Add Google services based on task requirements
    const config = this.config as GeminiFlowConfig;
    if (config.googleServices?.vertexAI) {
      args.push('--vertex-ai');
    }
    if (config.googleServices?.veo3 && this.requiresVideoGeneration(task)) {
      args.push('--veo3');
    }
    if (config.googleServices?.imagen4 && this.requiresImageGeneration(task)) {
      args.push('--imagen4');
    }

    return await this.runGeminiFlowCommand(args, this.config.timeout);
  }

  private async executeWithA2A(task: Task, context?: FlowExecutionContext): Promise<TaskResult> {
    this.logger.debug(`Executing task with A2A coordination: ${task.id}`);
    
    const config = this.config as GeminiFlowConfig;
    const a2aConfig = config.a2aConfig;
    
    const args = [
      'a2a', 'coordinate',
      `"${task.description}"`,
      '--transport', a2aConfig?.transport || 'websocket',
      '--agents', '6' // Use 6 agents for A2A coordination
    ];

    if (a2aConfig?.encryption) {
      args.push('--encrypted');
    }

    if (context?.sessionId) {
      args.push('--session-id', context.sessionId);
    }

    return await this.runGeminiFlowCommand(args, this.config.timeout);
  }

  private async executeWithStandardFlow(task: Task, context?: FlowExecutionContext): Promise<TaskResult> {
    this.logger.debug(`Executing task with standard flow: ${task.id}`);
    
    // Use CLI mode with appropriate agent selection
    const agent = this.getGeminiAgent(task);
    
    const args = [
      'cli', 'run',
      '--agent', agent,
      `"${task.description}"`
    ];

    if (context?.workingDirectory) {
      args.push('--cwd', context.workingDirectory);
    }

    // Add performance optimizations
    const config = this.config as GeminiFlowConfig;
    if (config.performanceConfig?.sqliteOptimization) {
      args.push('--optimize-sqlite');
    }

    return await this.runGeminiFlowCommand(args, this.config.timeout);
  }

  private getGeminiAgent(task: Task): string {
    const agentMap: Record<string, string> = {
      'code-generation': 'coder',
      'code-review': 'reviewer', 
      'research': 'researcher',
      'analysis': 'analyst',
      'documentation': 'documenter',
      'testing': 'tester',
      'refactoring': 'refactorer',
      'orchestration': 'orchestrator'
    };

    return agentMap[task.type] || 'generalist';
  }

  private requiresVideoGeneration(task: Task): boolean {
    const keywords = ['video', 'animation', 'visual', 'veo3'];
    return keywords.some(keyword => 
      task.description.toLowerCase().includes(keyword) ||
      task.metadata?.mediaType === 'video'
    );
  }

  private requiresImageGeneration(task: Task): boolean {
    const keywords = ['image', 'picture', 'visual', 'graphic', 'imagen'];
    return keywords.some(keyword => 
      task.description.toLowerCase().includes(keyword) ||
      task.metadata?.mediaType === 'image'
    );
  }

  private async runGeminiFlowCommand(args: string[], timeout: number): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.geminiFlowPath, args, {
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
    
    const config = this.config as GeminiFlowConfig;
    
    if (config.performanceConfig) {
      if (config.performanceConfig.concurrencyLevel <= 0) {
        throw new Error('performanceConfig.concurrencyLevel must be greater than 0');
      }
      if (config.performanceConfig.memoryPoolSize <= 0) {
        throw new Error('performanceConfig.memoryPoolSize must be greater than 0');
      }
    }
  }
}