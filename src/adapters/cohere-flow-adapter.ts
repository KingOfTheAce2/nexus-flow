import { BaseFlowAdapter, FlowAdapterConfig, FlowCapabilities, FlowExecutionContext } from './base-flow-adapter.js';
import { Task, TaskResult, FlowType, FlowStatus } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import axios, { AxiosInstance, AxiosError } from 'axios';

export interface CohereFlowConfig extends FlowAdapterConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  truncate?: 'NONE' | 'START' | 'END';
  toolsEnabled?: boolean;
  ragEnabled?: boolean;
  webSearchEnabled?: boolean;
  streamEnabled?: boolean;
  returnLikelihoods?: 'GENERATION' | 'ALL' | 'NONE';
  webAuthConfig?: {
    dashboardUrl: string;
    apiKeysUrl: string;
    playgroundUrl: string;
  };
}

export interface CohereMessage {
  role: 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL';
  message: string;
  tool_calls?: CohereToolCall[];
  tool_results?: CohereToolResult[];
}

export interface CohereToolCall {
  name: string;
  parameters: Record<string, any>;
}

export interface CohereToolResult {
  call: CohereToolCall;
  outputs: Array<{ result: any }>;
}

export interface CohereTool {
  name: string;
  description: string;
  parameter_definitions: Record<string, {
    description: string;
    type: string;
    required?: boolean;
  }>;
}

export interface CohereResponse {
  id: string;
  generation_id: string;
  response_id: string;
  text: string;
  finish_reason: 'COMPLETE' | 'MAX_TOKENS' | 'ERROR' | 'ERROR_TOXIC' | 'ERROR_LIMIT' | 'USER_CANCEL';
  tool_calls?: CohereToolCall[];
  meta?: {
    api_version: {
      version: string;
    };
    billed_units: {
      input_tokens: number;
      output_tokens: number;
    };
    tokens?: {
      input_tokens: number;
      output_tokens: number;
    };
    warnings?: string[];
  };
}

export class CohereFlowAdapter extends BaseFlowAdapter {
  private logger: Logger;
  private httpClient: AxiosInstance;
  private config: CohereFlowConfig;

  // Available Cohere models
  private static readonly AVAILABLE_MODELS = {
    'command': 'Command - General purpose conversational model',
    'command-light': 'Command Light - Faster, lighter version of Command',
    'command-nightly': 'Command Nightly - Latest experimental features',
    'command-r': 'Command R - Optimized for RAG and tool use',
    'command-r-plus': 'Command R+ - Enhanced version with better reasoning',
    'embed-english-v3.0': 'Embed English v3.0 - Text embeddings',
    'embed-multilingual-v3.0': 'Embed Multilingual v3.0 - Multilingual embeddings',
    'rerank-english-v3.0': 'Rerank English v3.0 - Document reranking',
    'rerank-multilingual-v3.0': 'Rerank Multilingual v3.0 - Multilingual reranking'
  };

  // Cohere tools for agentic capabilities
  private agenticTools: CohereTool[] = [
    {
      name: 'web_search',
      description: 'Search the web for current information',
      parameter_definitions: {
        query: {
          description: 'The search query',
          type: 'string',
          required: true
        },
        num_results: {
          description: 'Number of results to return',
          type: 'int'
        }
      }
    },
    {
      name: 'code_interpreter',
      description: 'Execute Python code and return results',
      parameter_definitions: {
        code: {
          description: 'Python code to execute',
          type: 'string',
          required: true
        }
      }
    },
    {
      name: 'file_operations',
      description: 'Perform file system operations',
      parameter_definitions: {
        operation: {
          description: 'Type of operation',
          type: 'string',
          required: true
        },
        path: {
          description: 'File or directory path',
          type: 'string',
          required: true
        },
        content: {
          description: 'Content for write operations',
          type: 'string'
        }
      }
    },
    {
      name: 'workflow_coordinate',
      description: 'Coordinate with other AI flows in the nexus system',
      parameter_definitions: {
        target_flow: {
          description: 'Target flow type to coordinate with',
          type: 'string',
          required: true
        },
        task_description: {
          description: 'Description of the task to delegate',
          type: 'string',
          required: true
        },
        priority: {
          description: 'Task priority from 1-10',
          type: 'int'
        }
      }
    }
  ];

  constructor(config: CohereFlowConfig) {
    super(config);
    this.config = config;
    this.logger = new Logger('CohereFlowAdapter');
    
    // Set default values
    this.config.endpoint = this.config.endpoint || 'https://api.cohere.ai/v1';
    this.config.model = this.config.model || 'command-r-plus';
    this.config.maxTokens = this.config.maxTokens || 4096;
    this.config.temperature = this.config.temperature || 0.3;
    this.config.topP = this.config.topP || 0.75;
    this.config.topK = this.config.topK || 0;
    this.config.presencePenalty = this.config.presencePenalty || 0;
    this.config.frequencyPenalty = this.config.frequencyPenalty || 0;
    this.config.stopSequences = this.config.stopSequences || [];
    this.config.truncate = this.config.truncate || 'END';
    this.config.toolsEnabled = this.config.toolsEnabled !== false;
    this.config.ragEnabled = this.config.ragEnabled !== false;
    this.config.webSearchEnabled = this.config.webSearchEnabled !== false;
    this.config.streamEnabled = this.config.streamEnabled || false;
    this.config.returnLikelihoods = this.config.returnLikelihoods || 'NONE';

    // Default web auth configuration
    this.config.webAuthConfig = this.config.webAuthConfig || {
      dashboardUrl: 'https://dashboard.cohere.com',
      apiKeysUrl: 'https://dashboard.cohere.com/api-keys',
      playgroundUrl: 'https://dashboard.cohere.com/playground'
    };

    this.httpClient = axios.create({
      baseURL: this.config.endpoint,
      timeout: this.config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'nexus-flow-cohere-adapter/1.0.0',
        'Cohere-Version': '2024-10-15' // Use latest API version
      }
    });

    this.setupHttpInterceptors();
    this.validateConfig();
  }

  get name(): string {
    return 'cohere-flow';
  }

  get type(): FlowType {
    return FlowType.COHERE;
  }

  get version(): string {
    return '1.0.0';
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Cohere Flow adapter...');
    
    try {
      // Check authentication
      if (!this.isAuthenticated()) {
        throw new Error('Cohere API key not configured. Please authenticate first.');
      }

      // Test API connectivity
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        throw new Error('Cohere API health check failed');
      }
      
      this.setStatus(FlowStatus.AVAILABLE);
      this.logger.info(`Cohere Flow adapter initialized successfully with model: ${this.config.model}`);

    } catch (error: any) {
      this.logger.error('Failed to initialize Cohere Flow adapter:', error);
      this.setStatus(FlowStatus.ERROR);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Cohere Flow adapter...');
    this.setStatus(FlowStatus.OFFLINE);
    this.logger.info('Cohere Flow adapter shutdown complete');
  }

  async executeTask(task: Task, context?: FlowExecutionContext): Promise<TaskResult> {
    if (!this.canAcceptTask()) {
      throw new Error(`Cohere Flow adapter cannot accept task: status=${this.status}, load=${this.currentLoad}/${this.getMaxLoad()}`);
    }

    this.incrementLoad();
    const startTime = Date.now();

    try {
      const systemMessage = this.buildSystemMessage(task, context);
      const userMessage = this.buildUserMessage(task);

      let response: CohereResponse;

      // Use tools if enabled and task requires it
      if (this.config.toolsEnabled && this.requiresTools(task)) {
        response = await this.executeWithTools(systemMessage, userMessage);
      } else {
        response = await this.executeStandardChat(systemMessage, userMessage);
      }

      const executionTime = Date.now() - startTime;
      
      this.logger.info(`Task completed: ${task.id} in ${executionTime}ms`);
      
      return this.createTaskResult(
        true,
        this.formatResponse(response),
        undefined,
        executionTime,
        { 
          model: this.config.model,
          usage: response.meta?.billed_units || response.meta?.tokens,
          finishReason: response.finish_reason,
          toolCalls: response.tool_calls?.length || 0,
          warnings: response.meta?.warnings
        }
      );

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      this.logger.error(`Task failed: ${task.id} - ${error.message}`);
      
      return this.createTaskResult(
        false,
        undefined,
        this.handleCohereError(error),
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
      // Test with a simple chat completion
      const response = await this.httpClient.post('/chat', {
        model: this.config.model,
        message: 'Hello',
        max_tokens: 10,
        temperature: 0
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey || process.env.COHERE_API_KEY}`
        }
      });

      return response.status === 200 && response.data.text;
    } catch (error: any) {
      this.logger.error('Cohere health check failed:', error.message);
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
      orchestration: true, // Through tool use
      hiveMind: false, // No native hive-mind
      swarmCoordination: true, // Through workflow coordination tools
      mcp: false, // No native MCP support
      webAuth: true // Supports web authentication
    };
  }

  async authenticate(): Promise<boolean> {
    // For Cohere, web authentication involves getting API key from dashboard
    if (this.config.authConfig?.type === 'web') {
      const authUrl = this.getAuthUrl();
      if (authUrl) {
        this.logger.info('Opening Cohere authentication URL...');
        await this.openAuthUrl(authUrl);
        
        this.logger.info('Please create an API key in your Cohere dashboard and set it in your environment.');
        this.logger.info('Set COHERE_API_KEY environment variable or update your nexus-flow configuration.');
        
        return false; // User needs to manually configure API key
      }
    }

    return this.isAuthenticated();
  }

  isAuthenticated(): boolean {
    return !!(this.config.apiKey || process.env.COHERE_API_KEY);
  }

  getAuthUrl(): string {
    return this.config.webAuthConfig?.apiKeysUrl || 'https://dashboard.cohere.com/api-keys';
  }

  private buildSystemMessage(task: Task, context?: FlowExecutionContext): string {
    let message = `You are Cohere AI, an advanced AI assistant with strong reasoning and tool-use capabilities, integrated into the Nexus Flow orchestration system.

Your key strengths include:
- Advanced reasoning and analysis
- Tool use and function calling
- Retrieval-augmented generation (RAG)
- Multi-step problem solving
- Code generation and review

Current task type: ${task.type}
Priority: ${task.priority}
`;

    if (this.config.toolsEnabled) {
      message += '\nYou have access to various tools. Use them when necessary to accomplish the task effectively.';
    }

    if (this.config.ragEnabled) {
      message += '\nUse retrieval-augmented generation when you need to reference external knowledge or documents.';
    }

    if (context?.workingDirectory) {
      message += `\nWorking directory: ${context.workingDirectory}`;
    }

    if (context?.environmentVars) {
      message += `\nEnvironment variables: ${JSON.stringify(context.environmentVars, null, 2)}`;
    }

    // Task-specific guidance
    switch (task.type) {
      case 'code-generation':
        message += '\nFor coding tasks, provide clean, well-documented code with explanations.';
        break;
      case 'analysis':
        message += '\nFor analysis tasks, break down problems systematically and provide detailed insights.';
        break;
      case 'research':
        message += '\nFor research tasks, gather comprehensive information and cite sources when possible.';
        break;
      case 'orchestration':
        message += '\nFor orchestration tasks, coordinate effectively with other systems and tools.';
        break;
    }

    return message;
  }

  private buildUserMessage(task: Task): string {
    let message = `Task: ${task.description}`;
    
    if (task.metadata) {
      message += `\n\nAdditional context: ${JSON.stringify(task.metadata, null, 2)}`;
    }

    return message;
  }

  private requiresTools(task: Task): boolean {
    const toolRequiredTypes = ['code-generation', 'testing', 'research', 'orchestration'];
    return toolRequiredTypes.includes(task.type) || 
           task.description.toLowerCase().includes('search') ||
           task.description.toLowerCase().includes('execute') ||
           task.description.toLowerCase().includes('run') ||
           task.description.toLowerCase().includes('coordinate');
  }

  private async executeWithTools(systemMessage: string, userMessage: string): Promise<CohereResponse> {
    const response = await this.httpClient.post('/chat', {
      model: this.config.model,
      message: userMessage,
      preamble: systemMessage,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      p: this.config.topP,
      k: this.config.topK > 0 ? this.config.topK : undefined,
      presence_penalty: this.config.presencePenalty,
      frequency_penalty: this.config.frequencyPenalty,
      stop_sequences: this.config.stopSequences.length > 0 ? this.config.stopSequences : undefined,
      return_likelihoods: this.config.returnLikelihoods,
      truncate: this.config.truncate,
      tools: this.agenticTools,
      stream: this.config.streamEnabled
    }, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey || process.env.COHERE_API_KEY}`
      }
    });

    let cohereResponse = response.data;

    // Execute tool calls if present
    if (cohereResponse.tool_calls && cohereResponse.tool_calls.length > 0) {
      const toolResults = await this.executeToolCalls(cohereResponse.tool_calls);
      
      // Make follow-up request with tool results
      const followUpResponse = await this.httpClient.post('/chat', {
        model: this.config.model,
        message: userMessage,
        preamble: systemMessage,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        p: this.config.topP,
        k: this.config.topK > 0 ? this.config.topK : undefined,
        presence_penalty: this.config.presencePenalty,
        frequency_penalty: this.config.frequencyPenalty,
        tools: this.agenticTools,
        tool_results: toolResults,
        stream: this.config.streamEnabled
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey || process.env.COHERE_API_KEY}`
        }
      });

      cohereResponse = followUpResponse.data;
    }

    return cohereResponse;
  }

  private async executeStandardChat(systemMessage: string, userMessage: string): Promise<CohereResponse> {
    const response = await this.httpClient.post('/chat', {
      model: this.config.model,
      message: userMessage,
      preamble: systemMessage,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      p: this.config.topP,
      k: this.config.topK > 0 ? this.config.topK : undefined,
      presence_penalty: this.config.presencePenalty,
      frequency_penalty: this.config.frequencyPenalty,
      stop_sequences: this.config.stopSequences.length > 0 ? this.config.stopSequences : undefined,
      return_likelihoods: this.config.returnLikelihoods,
      truncate: this.config.truncate,
      stream: this.config.streamEnabled
    }, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey || process.env.COHERE_API_KEY}`
      }
    });

    return response.data;
  }

  private async executeToolCalls(toolCalls: CohereToolCall[]): Promise<CohereToolResult[]> {
    const results: CohereToolResult[] = [];

    for (const toolCall of toolCalls) {
      try {
        const result = await this.executeToolCall(toolCall);
        results.push({
          call: toolCall,
          outputs: [{ result }]
        });
      } catch (error: any) {
        this.logger.error(`Tool call failed: ${toolCall.name}`, error);
        results.push({
          call: toolCall,
          outputs: [{ result: `Error: ${error.message}` }]
        });
      }
    }

    return results;
  }

  private async executeToolCall(toolCall: CohereToolCall): Promise<any> {
    const { name, parameters } = toolCall;

    this.logger.debug(`Executing tool: ${name} with parameters:`, parameters);

    switch (name) {
      case 'web_search':
        return this.executeWebSearch(parameters);
      case 'code_interpreter':
        return this.executeCodeInterpreter(parameters);
      case 'file_operations':
        return this.executeFileOperations(parameters);
      case 'workflow_coordinate':
        return this.executeWorkflowCoordination(parameters);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async executeWebSearch(parameters: any): Promise<string> {
    // Integration with web search provider
    return `Web search results for: "${parameters.query}" (${parameters.num_results || 5} results)`;
  }

  private async executeCodeInterpreter(parameters: any): Promise<string> {
    // Integration with code execution environment
    return `Code execution result: ${parameters.code.substring(0, 100)}...`;
  }

  private async executeFileOperations(parameters: any): Promise<string> {
    // Integration with file system operations
    return `File operation: ${parameters.operation} on ${parameters.path}`;
  }

  private async executeWorkflowCoordination(parameters: any): Promise<string> {
    // Emit coordination event for nexus system
    this.emit('workflow-coordination', {
      targetFlow: parameters.target_flow,
      taskDescription: parameters.task_description,
      priority: parameters.priority || 5
    });
    
    return `Workflow coordination initiated: delegating to ${parameters.target_flow}`;
  }

  private formatResponse(response: CohereResponse): string {
    let formattedResponse = response.text;

    // Add tool call information if present
    if (response.tool_calls && response.tool_calls.length > 0) {
      formattedResponse += '\n\n**Tool Usage:**\n';
      response.tool_calls.forEach((toolCall, index) => {
        formattedResponse += `${index + 1}. ${toolCall.name}(${JSON.stringify(toolCall.parameters)})\n`;
      });
    }

    // Add warnings if present
    if (response.meta?.warnings && response.meta.warnings.length > 0) {
      formattedResponse += '\n\n**Warnings:**\n';
      response.meta.warnings.forEach((warning, index) => {
        formattedResponse += `${index + 1}. ${warning}\n`;
      });
    }

    return formattedResponse;
  }

  private handleCohereError(error: AxiosError): string {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;
      
      switch (status) {
        case 401:
          return 'Authentication failed. Please check your Cohere API key.';
        case 429:
          return 'Rate limit exceeded. Please try again later.';
        case 400:
          return `Bad request: ${data?.message || 'Invalid parameters'}`;
        case 402:
          return 'Payment required. Please check your Cohere account billing status.';
        case 422:
          return `Validation error: ${data?.message || 'Request validation failed'}`;
        case 500:
          return 'Cohere API server error. Please try again later.';
        default:
          return `API error (${status}): ${data?.message || error.message}`;
      }
    }
    
    if (error.code === 'ECONNREFUSED') {
      return 'Cannot connect to Cohere API. Please check your internet connection.';
    }
    
    if (error.code === 'ETIMEDOUT') {
      return 'Request timed out. Cohere may be experiencing high load.';
    }
    
    return error.message || 'Unknown error occurred';
  }

  private setupHttpInterceptors(): void {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        this.logger.debug(`Making request to Cohere: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.debug(`Cohere response: ${response.status} ${response.statusText}`);
        
        // Log usage information
        if (response.data.meta?.billed_units) {
          const usage = response.data.meta.billed_units;
          this.logger.debug(`Token usage: ${usage.input_tokens} input, ${usage.output_tokens} output`);
        }
        
        return response;
      },
      (error) => {
        this.logger.error('Cohere API error:', error.response?.status, error.message);
        return Promise.reject(error);
      }
    );
  }

  protected validateConfig(): void {
    super.validateConfig();
    
    const config = this.config as CohereFlowConfig;
    
    if (!config.endpoint) {
      throw new Error('Cohere API endpoint is required');
    }
    
    if (!config.model) {
      throw new Error('Cohere model is required');
    }
    
    // Validate model selection
    if (!Object.keys(CohereFlowAdapter.AVAILABLE_MODELS).includes(config.model)) {
      this.logger.warn(`Unknown model: ${config.model}. Available models:`, Object.keys(CohereFlowAdapter.AVAILABLE_MODELS));
    }
    
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 5)) {
      throw new Error('Temperature must be between 0 and 5 for Cohere');
    }
    
    if (config.topP !== undefined && (config.topP < 0 || config.topP > 1)) {
      throw new Error('topP must be between 0 and 1');
    }

    if (config.maxTokens !== undefined && config.maxTokens <= 0) {
      throw new Error('maxTokens must be greater than 0');
    }

    if (config.topK !== undefined && config.topK < 0) {
      throw new Error('topK must be 0 or greater');
    }

    if (config.presencePenalty !== undefined && (config.presencePenalty < 0 || config.presencePenalty > 1)) {
      throw new Error('presencePenalty must be between 0 and 1 for Cohere');
    }

    if (config.frequencyPenalty !== undefined && (config.frequencyPenalty < 0 || config.frequencyPenalty > 1)) {
      throw new Error('frequencyPenalty must be between 0 and 1 for Cohere');
    }
  }

  // Helper method to get available models
  static getAvailableModels(): Record<string, string> {
    return CohereFlowAdapter.AVAILABLE_MODELS;
  }

  // Helper method to check if RAG is enabled
  hasRAGCapability(): boolean {
    return this.config.ragEnabled === true;
  }

  // Helper method to check if tools are enabled
  hasToolsCapability(): boolean {
    return this.config.toolsEnabled === true;
  }
}