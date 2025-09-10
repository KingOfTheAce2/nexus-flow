import { BaseFlowAdapter, FlowAdapterConfig, FlowCapabilities, FlowExecutionContext } from './base-flow-adapter.js';
import { Task, TaskResult, FlowType, FlowStatus } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import axios, { AxiosInstance, AxiosError } from 'axios';

export interface MistralFlowConfig extends FlowAdapterConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  functionCallingEnabled?: boolean;
  safePrompt?: boolean;
  randomSeed?: number;
  webAuthConfig?: {
    chatUrl: string;
    consoleUrl: string;
    apiKeysUrl: string;
  };
}

export interface MistralMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: MistralToolCall[];
  tool_call_id?: string;
}

export interface MistralToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface MistralFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export class MistralFlowAdapter extends BaseFlowAdapter {
  private logger: Logger;
  private httpClient: AxiosInstance;
  private config: MistralFlowConfig;

  // Mistral AI function definitions for agentic capabilities
  private agenticFunctions: MistralFunction[] = [
    {
      name: 'execute_code',
      description: 'Execute code in a specified language',
      parameters: {
        type: 'object',
        properties: {
          language: { type: 'string', description: 'Programming language (python, javascript, bash, etc.)' },
          code: { type: 'string', description: 'Code to execute' },
          working_directory: { type: 'string', description: 'Working directory for code execution' }
        },
        required: ['language', 'code']
      }
    },
    {
      name: 'file_operations',
      description: 'Perform file system operations',
      parameters: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['read', 'write', 'create', 'delete', 'list'] },
          path: { type: 'string', description: 'File or directory path' },
          content: { type: 'string', description: 'Content for write operations' },
          recursive: { type: 'boolean', description: 'Recursive operation for directories' }
        },
        required: ['operation', 'path']
      }
    },
    {
      name: 'web_search',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          num_results: { type: 'number', description: 'Number of results to return', default: 5 }
        },
        required: ['query']
      }
    },
    {
      name: 'workflow_coordinate',
      description: 'Coordinate with other AI flows in the nexus system',
      parameters: {
        type: 'object',
        properties: {
          target_flow: { type: 'string', description: 'Target flow type' },
          task_description: { type: 'string', description: 'Task to delegate' },
          priority: { type: 'number', description: 'Task priority (1-10)' }
        },
        required: ['target_flow', 'task_description']
      }
    }
  ];

  constructor(config: MistralFlowConfig) {
    super(config);
    this.config = config;
    this.logger = new Logger('MistralFlowAdapter');
    
    // Set default values
    this.config.endpoint = this.config.endpoint || 'https://api.mistral.ai/v1';
    this.config.model = this.config.model || 'mistral-large-latest';
    this.config.maxTokens = this.config.maxTokens || 4096;
    this.config.temperature = this.config.temperature || 0.7;
    this.config.topP = this.config.topP || 1.0;
    this.config.functionCallingEnabled = this.config.functionCallingEnabled !== false;
    this.config.safePrompt = this.config.safePrompt !== false;

    // Default web auth configuration
    this.config.webAuthConfig = this.config.webAuthConfig || {
      chatUrl: 'https://chat.mistral.ai',
      consoleUrl: 'https://console.mistral.ai',
      apiKeysUrl: 'https://console.mistral.ai/api-keys'
    };

    this.httpClient = axios.create({
      baseURL: this.config.endpoint,
      timeout: this.config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'nexus-flow-mistral-adapter/1.0.0'
      }
    });

    this.setupHttpInterceptors();
    this.validateConfig();
  }

  get name(): string {
    return 'mistral-flow';
  }

  get type(): FlowType {
    return FlowType.MISTRAL;
  }

  get version(): string {
    return '1.0.0';
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Mistral Flow adapter...');
    
    try {
      // Check authentication
      if (!this.isAuthenticated()) {
        throw new Error('Mistral API key not configured. Please authenticate first.');
      }

      // Test API connectivity
      await this.checkHealth();
      
      this.setStatus(FlowStatus.AVAILABLE);
      this.logger.info('Mistral Flow adapter initialized successfully');

    } catch (error: any) {
      this.logger.error('Failed to initialize Mistral Flow adapter:', error);
      this.setStatus(FlowStatus.ERROR);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Mistral Flow adapter...');
    this.setStatus(FlowStatus.OFFLINE);
    this.logger.info('Mistral Flow adapter shutdown complete');
  }

  async executeTask(task: Task, context?: FlowExecutionContext): Promise<TaskResult> {
    if (!this.canAcceptTask()) {
      throw new Error(`Mistral Flow adapter cannot accept task: status=${this.status}, load=${this.currentLoad}/${this.getMaxLoad()}`);
    }

    this.incrementLoad();
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt(task, context);
      const userPrompt = this.buildUserPrompt(task);

      const messages: MistralMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      let response: string = '';
      let functionCalls: MistralToolCall[] = [];

      // Execute with function calling if enabled
      if (this.config.functionCallingEnabled && this.requiresFunctionCalling(task)) {
        const result = await this.executeWithFunctions(messages);
        response = result.content;
        functionCalls = result.toolCalls;
      } else {
        response = await this.executeStandardCompletion(messages);
      }

      const executionTime = Date.now() - startTime;
      
      this.logger.info(`Task completed: ${task.id} in ${executionTime}ms`);
      
      return this.createTaskResult(
        true,
        response,
        undefined,
        executionTime,
        { 
          model: this.config.model,
          functionCalls: functionCalls.length,
          tokens: response.length // Approximation
        }
      );

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      this.logger.error(`Task failed: ${task.id} - ${error.message}`);
      
      return this.createTaskResult(
        false,
        undefined,
        this.handleMistralError(error),
        executionTime,
        { 
          errorType: error.constructor.name,
          statusCode: error.response?.status 
        }
      );
    } finally {
      this.decrementLoad();
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      // Test with a simple completion
      const response = await this.httpClient.post('/chat/completions', {
        model: this.config.model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      return response.status === 200;
    } catch (error: any) {
      this.logger.error('Mistral health check failed:', error.message);
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
      hiveMind: false, // Mistral doesn't have native hive-mind capabilities
      swarmCoordination: true, // Can coordinate through function calling
      mcp: false, // No native MCP support
      webAuth: true // Supports web authentication
    };
  }

  async authenticate(): Promise<boolean> {
    // For Mistral, web authentication involves getting API key from console
    if (this.config.authConfig?.type === 'web') {
      const authUrl = this.getAuthUrl();
      if (authUrl) {
        this.logger.info('Opening Mistral authentication URL...');
        await this.openAuthUrl(authUrl);
        
        this.logger.info('Please copy your API key from the Mistral Console and set it in your environment.');
        this.logger.info('Set MISTRAL_API_KEY environment variable or update your nexus-flow configuration.');
        
        return false; // User needs to manually configure API key
      }
    }

    return this.isAuthenticated();
  }

  isAuthenticated(): boolean {
    return !!(this.config.apiKey || process.env.MISTRAL_API_KEY);
  }

  getAuthUrl(): string {
    return this.config.webAuthConfig?.apiKeysUrl || 'https://console.mistral.ai/api-keys';
  }

  private buildSystemPrompt(task: Task, context?: FlowExecutionContext): string {
    let prompt = `You are Mistral AI, a highly capable AI assistant integrated into the Nexus Flow orchestration system. 

Your role is to execute tasks with precision and excellence. You have access to advanced capabilities including:
- Code generation and analysis
- File system operations
- Web search
- Workflow coordination with other AI systems

Current task type: ${task.type}
Priority: ${task.priority}
`;

    if (context?.workingDirectory) {
      prompt += `\nWorking directory: ${context.workingDirectory}`;
    }

    if (context?.environmentVars) {
      prompt += `\nEnvironment variables: ${JSON.stringify(context.environmentVars, null, 2)}`;
    }

    if (this.config.functionCallingEnabled) {
      prompt += '\n\nYou can use function calls to perform complex operations. Use them when needed to accomplish the task effectively.';
    }

    return prompt;
  }

  private buildUserPrompt(task: Task): string {
    let prompt = `Task: ${task.description}`;
    
    if (task.metadata) {
      prompt += `\n\nAdditional context: ${JSON.stringify(task.metadata, null, 2)}`;
    }

    return prompt;
  }

  private requiresFunctionCalling(task: Task): boolean {
    const functionRequiredTypes = ['code-generation', 'testing', 'refactoring', 'orchestration'];
    return functionRequiredTypes.includes(task.type) || 
           task.description.includes('execute') || 
           task.description.includes('run') ||
           task.description.includes('coordinate');
  }

  private async executeWithFunctions(messages: MistralMessage[]): Promise<{content: string, toolCalls: MistralToolCall[]}> {
    const response = await this.httpClient.post('/chat/completions', {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      safe_prompt: this.config.safePrompt,
      random_seed: this.config.randomSeed,
      tools: this.agenticFunctions.map(func => ({
        type: 'function',
        function: func
      })),
      tool_choice: 'auto'
    }, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey || process.env.MISTRAL_API_KEY}`
      }
    });

    const choice = response.data.choices[0];
    const message = choice.message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      // Execute function calls
      const toolResults: string[] = [];
      for (const toolCall of message.tool_calls) {
        const result = await this.executeFunctionCall(toolCall);
        toolResults.push(`Function ${toolCall.function.name} result: ${result}`);
      }

      return {
        content: message.content + '\n\n' + toolResults.join('\n'),
        toolCalls: message.tool_calls
      };
    }

    return {
      content: message.content || 'Task completed',
      toolCalls: []
    };
  }

  private async executeStandardCompletion(messages: MistralMessage[]): Promise<string> {
    const response = await this.httpClient.post('/chat/completions', {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      safe_prompt: this.config.safePrompt,
      random_seed: this.config.randomSeed
    }, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey || process.env.MISTRAL_API_KEY}`
      }
    });

    return response.data.choices[0].message.content || 'Task completed';
  }

  private async executeFunctionCall(toolCall: MistralToolCall): Promise<string> {
    const { name, arguments: args } = toolCall.function;
    const parsedArgs = JSON.parse(args);

    this.logger.debug(`Executing function: ${name} with args:`, parsedArgs);

    switch (name) {
      case 'execute_code':
        return this.executeCodeFunction(parsedArgs);
      case 'file_operations':
        return this.executeFileOperation(parsedArgs);
      case 'web_search':
        return this.executeWebSearch(parsedArgs);
      case 'workflow_coordinate':
        return this.executeWorkflowCoordination(parsedArgs);
      default:
        return `Function ${name} not implemented`;
    }
  }

  private async executeCodeFunction(args: any): Promise<string> {
    // This would integrate with the nexus-flow execution engine
    // For now, return a placeholder
    return `Code execution requested: ${args.language} - ${args.code.substring(0, 100)}...`;
  }

  private async executeFileOperation(args: any): Promise<string> {
    // This would integrate with the nexus-flow file system operations
    return `File operation: ${args.operation} on ${args.path}`;
  }

  private async executeWebSearch(args: any): Promise<string> {
    // This would integrate with a web search provider
    return `Web search for: ${args.query} (${args.num_results || 5} results)`;
  }

  private async executeWorkflowCoordination(args: any): Promise<string> {
    // This would integrate with the nexus-flow queen bee coordination
    this.emit('workflow-coordination', {
      targetFlow: args.target_flow,
      taskDescription: args.task_description,
      priority: args.priority || 5
    });
    
    return `Workflow coordination initiated: delegating to ${args.target_flow}`;
  }

  private handleMistralError(error: AxiosError): string {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;
      
      switch (status) {
        case 401:
          return 'Authentication failed. Please check your API key.';
        case 429:
          return 'Rate limit exceeded. Please try again later.';
        case 400:
          return `Bad request: ${data?.message || 'Invalid parameters'}`;
        case 500:
          return 'Mistral API server error. Please try again later.';
        default:
          return `API error (${status}): ${data?.message || error.message}`;
      }
    }
    
    if (error.code === 'ECONNREFUSED') {
      return 'Cannot connect to Mistral API. Please check your internet connection.';
    }
    
    return error.message || 'Unknown error occurred';
  }

  private setupHttpInterceptors(): void {
    // Request interceptor for logging
    this.httpClient.interceptors.request.use(
      (config) => {
        this.logger.debug(`Making request to: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.debug(`Response received: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        this.logger.error('Response interceptor error:', error.response?.status, error.message);
        return Promise.reject(error);
      }
    );
  }

  protected validateConfig(): void {
    super.validateConfig();
    
    const config = this.config as MistralFlowConfig;
    
    if (!config.endpoint) {
      throw new Error('Mistral API endpoint is required');
    }
    
    if (!config.model) {
      throw new Error('Mistral model is required');
    }
    
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      throw new Error('Temperature must be between 0 and 2');
    }
    
    if (config.topP !== undefined && (config.topP < 0 || config.topP > 1)) {
      throw new Error('topP must be between 0 and 1');
    }

    if (config.maxTokens !== undefined && config.maxTokens <= 0) {
      throw new Error('maxTokens must be greater than 0');
    }
  }
}