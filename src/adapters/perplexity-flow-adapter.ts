import { BaseFlowAdapter, FlowAdapterConfig, FlowCapabilities, FlowExecutionContext } from './base-flow-adapter.js';
import { Task, TaskResult, FlowType, FlowStatus } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import axios, { AxiosInstance, AxiosError } from 'axios';

export interface PerplexityFlowConfig extends FlowAdapterConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  webSearchEnabled?: boolean;
  citationsEnabled?: boolean;
  streamEnabled?: boolean;
  webAuthConfig?: {
    homeUrl: string;
    settingsUrl: string;
    apiKeysUrl: string;
  };
}

export interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PerplexitySearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
}

export interface PerplexityResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: PerplexityMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: string[];
  search_results?: PerplexitySearchResult[];
}

export class PerplexityFlowAdapter extends BaseFlowAdapter {
  private logger: Logger;
  private httpClient: AxiosInstance;
  private config: PerplexityFlowConfig;

  // Available Perplexity models
  private static readonly AVAILABLE_MODELS = {
    'llama-3.1-sonar-small-128k-online': 'Sonar Small Online - Fast responses with web search',
    'llama-3.1-sonar-large-128k-online': 'Sonar Large Online - High-quality responses with web search',
    'llama-3.1-sonar-huge-128k-online': 'Sonar Huge Online - Best quality responses with web search',
    'llama-3.1-8b-instruct': 'Llama 3.1 8B - Fast offline model',
    'llama-3.1-70b-instruct': 'Llama 3.1 70B - High-quality offline model',
    'codellama-34b-instruct': 'Code Llama 34B - Specialized for coding tasks'
  };

  constructor(config: PerplexityFlowConfig) {
    super(config);
    this.config = config;
    this.logger = new Logger('PerplexityFlowAdapter');
    
    // Set default values
    this.config.endpoint = this.config.endpoint || 'https://api.perplexity.ai';
    this.config.model = this.config.model || 'llama-3.1-sonar-large-128k-online';
    this.config.maxTokens = this.config.maxTokens || 4096;
    this.config.temperature = this.config.temperature || 0.2;
    this.config.topP = this.config.topP || 0.9;
    this.config.topK = this.config.topK || 0;
    this.config.presencePenalty = this.config.presencePenalty || 0;
    this.config.frequencyPenalty = this.config.frequencyPenalty || 1;
    this.config.webSearchEnabled = this.config.webSearchEnabled !== false;
    this.config.citationsEnabled = this.config.citationsEnabled !== false;
    this.config.streamEnabled = this.config.streamEnabled || false;

    // Default web auth configuration
    this.config.webAuthConfig = this.config.webAuthConfig || {
      homeUrl: 'https://www.perplexity.ai',
      settingsUrl: 'https://www.perplexity.ai/settings',
      apiKeysUrl: 'https://www.perplexity.ai/settings/api'
    };

    this.httpClient = axios.create({
      baseURL: this.config.endpoint,
      timeout: this.config.timeout || 45000, // Longer timeout for research tasks
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'nexus-flow-perplexity-adapter/1.0.0'
      }
    });

    this.setupHttpInterceptors();
    this.validateConfig();
  }

  get name(): string {
    return 'perplexity-flow';
  }

  get type(): FlowType {
    return FlowType.PERPLEXITY;
  }

  get version(): string {
    return '1.0.0';
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Perplexity Flow adapter...');
    
    try {
      // Check authentication
      if (!this.isAuthenticated()) {
        throw new Error('Perplexity API key not configured. Please authenticate first.');
      }

      // Test API connectivity
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        throw new Error('Perplexity API health check failed');
      }
      
      this.setStatus(FlowStatus.AVAILABLE);
      this.logger.info(`Perplexity Flow adapter initialized successfully with model: ${this.config.model}`);

    } catch (error: any) {
      this.logger.error('Failed to initialize Perplexity Flow adapter:', error);
      this.setStatus(FlowStatus.ERROR);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Perplexity Flow adapter...');
    this.setStatus(FlowStatus.OFFLINE);
    this.logger.info('Perplexity Flow adapter shutdown complete');
  }

  async executeTask(task: Task, context?: FlowExecutionContext): Promise<TaskResult> {
    if (!this.canAcceptTask()) {
      throw new Error(`Perplexity Flow adapter cannot accept task: status=${this.status}, load=${this.currentLoad}/${this.getMaxLoad()}`);
    }

    this.incrementLoad();
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt(task, context);
      const userPrompt = this.buildUserPrompt(task);

      const messages: PerplexityMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      // Select appropriate model based on task type
      const model = this.selectModelForTask(task);
      
      const response = await this.executeCompletion(messages, model);
      const executionTime = Date.now() - startTime;
      
      this.logger.info(`Task completed: ${task.id} in ${executionTime}ms`);
      
      return this.createTaskResult(
        true,
        this.formatResponse(response),
        undefined,
        executionTime,
        { 
          model: response.model,
          usage: response.usage,
          citations: response.citations?.length || 0,
          searchResults: response.search_results?.length || 0,
          hasWebSearch: this.isOnlineModel(model)
        }
      );

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      this.logger.error(`Task failed: ${task.id} - ${error.message}`);
      
      return this.createTaskResult(
        false,
        undefined,
        this.handlePerplexityError(error),
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
        model: 'llama-3.1-8b-instruct', // Use fastest model for health check
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10,
        temperature: 0
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey || process.env.PERPLEXITY_API_KEY}`
        }
      });

      return response.status === 200 && response.data.choices?.length > 0;
    } catch (error: any) {
      this.logger.error('Perplexity health check failed:', error.message);
      return false;
    }
  }

  getCapabilities(): FlowCapabilities {
    return {
      codeGeneration: true,
      codeReview: true,
      research: true, // Perplexity's strongest capability
      analysis: true,
      documentation: true,
      testing: false, // Limited testing capabilities
      refactoring: true,
      orchestration: false, // No native orchestration support
      hiveMind: false, // No hive-mind capabilities
      swarmCoordination: false, // Limited coordination features
      mcp: false, // No native MCP support
      webAuth: true // Supports web authentication
    };
  }

  async authenticate(): Promise<boolean> {
    // For Perplexity, web authentication involves getting API key from settings
    if (this.config.authConfig?.type === 'web') {
      const authUrl = this.getAuthUrl();
      if (authUrl) {
        this.logger.info('Opening Perplexity authentication URL...');
        await this.openAuthUrl(authUrl);
        
        this.logger.info('Please create an API key in your Perplexity settings and set it in your environment.');
        this.logger.info('Set PERPLEXITY_API_KEY environment variable or update your nexus-flow configuration.');
        
        return false; // User needs to manually configure API key
      }
    }

    return this.isAuthenticated();
  }

  isAuthenticated(): boolean {
    return !!(this.config.apiKey || process.env.PERPLEXITY_API_KEY);
  }

  getAuthUrl(): string {
    return this.config.webAuthConfig?.apiKeysUrl || 'https://www.perplexity.ai/settings/api';
  }

  private buildSystemPrompt(task: Task, context?: FlowExecutionContext): string {
    let prompt = `You are Perplexity AI, an advanced AI assistant with powerful research and analysis capabilities, integrated into the Nexus Flow orchestration system.

Your key strengths include:
- Real-time web search and current information access
- Comprehensive research with citations
- Factual accuracy and source verification
- In-depth analysis and reasoning

Current task type: ${task.type}
Priority: ${task.priority}
`;

    if (this.config.webSearchEnabled && this.isOnlineModel(this.config.model!)) {
      prompt += '\nYou have access to real-time web search capabilities. Use this to provide current, accurate information.';
    }

    if (this.config.citationsEnabled) {
      prompt += '\nAlways provide citations and sources for your information when available.';
    }

    if (context?.workingDirectory) {
      prompt += `\nWorking directory: ${context.workingDirectory}`;
    }

    if (context?.environmentVars) {
      prompt += `\nEnvironment variables: ${JSON.stringify(context.environmentVars, null, 2)}`;
    }

    // Task-specific guidance
    switch (task.type) {
      case 'research':
        prompt += '\nFor research tasks, prioritize accuracy, comprehensiveness, and current information.';
        break;
      case 'code-generation':
        prompt += '\nFor coding tasks, provide working code with explanations and best practices.';
        break;
      case 'analysis':
        prompt += '\nFor analysis tasks, break down complex problems systematically and provide detailed insights.';
        break;
      case 'documentation':
        prompt += '\nFor documentation tasks, create clear, comprehensive, and well-structured documentation.';
        break;
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

  private selectModelForTask(task: Task): string {
    // Select optimal model based on task type and requirements
    switch (task.type) {
      case 'research':
        return 'llama-3.1-sonar-large-128k-online'; // Best for research with web search
      case 'code-generation':
      case 'code-review':
      case 'refactoring':
        return 'codellama-34b-instruct'; // Specialized for coding
      case 'analysis':
        return this.config.webSearchEnabled 
          ? 'llama-3.1-sonar-huge-128k-online' 
          : 'llama-3.1-70b-instruct';
      default:
        return this.config.model || 'llama-3.1-sonar-large-128k-online';
    }
  }

  private isOnlineModel(model: string): boolean {
    return model.includes('sonar') && model.includes('online');
  }

  private async executeCompletion(messages: PerplexityMessage[], model: string): Promise<PerplexityResponse> {
    const requestPayload: any = {
      model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      presence_penalty: this.config.presencePenalty,
      frequency_penalty: this.config.frequencyPenalty,
      stream: this.config.streamEnabled
    };

    // Add top_k only if it's greater than 0 (Perplexity specific)
    if (this.config.topK && this.config.topK > 0) {
      requestPayload.top_k = this.config.topK;
    }

    // Enable citations for online models
    if (this.isOnlineModel(model) && this.config.citationsEnabled) {
      requestPayload.return_citations = true;
      requestPayload.return_images = false; // Focus on text content
    }

    const response = await this.httpClient.post('/chat/completions', requestPayload, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey || process.env.PERPLEXITY_API_KEY}`
      }
    });

    return response.data;
  }

  private formatResponse(response: PerplexityResponse): string {
    let formattedResponse = response.choices[0].message.content;

    // Add citations if available
    if (response.citations && response.citations.length > 0 && this.config.citationsEnabled) {
      formattedResponse += '\n\n**Sources:**\n';
      response.citations.forEach((citation, index) => {
        formattedResponse += `[${index + 1}] ${citation}\n`;
      });
    }

    // Add search results summary if available
    if (response.search_results && response.search_results.length > 0) {
      formattedResponse += '\n\n**Research Sources:**\n';
      response.search_results.slice(0, 3).forEach((result, index) => {
        formattedResponse += `${index + 1}. **${result.title}**\n   ${result.url}\n`;
        if (result.publishedDate) {
          formattedResponse += `   Published: ${result.publishedDate}\n`;
        }
        formattedResponse += '\n';
      });
    }

    return formattedResponse;
  }

  private handlePerplexityError(error: AxiosError): string {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;
      
      switch (status) {
        case 401:
          return 'Authentication failed. Please check your Perplexity API key.';
        case 429:
          return 'Rate limit exceeded. Perplexity has usage limits. Please try again later.';
        case 400:
          return `Bad request: ${data?.error?.message || data?.message || 'Invalid parameters'}`;
        case 402:
          return 'Payment required. Please check your Perplexity account billing status.';
        case 500:
          return 'Perplexity API server error. Please try again later.';
        case 503:
          return 'Perplexity service temporarily unavailable. Please try again later.';
        default:
          return `API error (${status}): ${data?.error?.message || data?.message || error.message}`;
      }
    }
    
    if (error.code === 'ECONNREFUSED') {
      return 'Cannot connect to Perplexity API. Please check your internet connection.';
    }
    
    if (error.code === 'ETIMEDOUT') {
      return 'Request timed out. Perplexity may be experiencing high load.';
    }
    
    return error.message || 'Unknown error occurred';
  }

  private setupHttpInterceptors(): void {
    // Request interceptor for logging and rate limiting
    this.httpClient.interceptors.request.use(
      (config) => {
        this.logger.debug(`Making request to Perplexity: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling and logging
    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.debug(`Perplexity response: ${response.status} ${response.statusText}`);
        
        // Log usage information
        if (response.data.usage) {
          this.logger.debug(`Token usage: ${response.data.usage.total_tokens} total, ${response.data.usage.completion_tokens} completion`);
        }
        
        return response;
      },
      (error) => {
        this.logger.error('Perplexity API error:', error.response?.status, error.message);
        
        // Log rate limiting information
        if (error.response?.status === 429) {
          const resetTime = error.response.headers['x-ratelimit-reset'];
          if (resetTime) {
            this.logger.warn(`Rate limit reset time: ${new Date(resetTime * 1000).toISOString()}`);
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  protected validateConfig(): void {
    super.validateConfig();
    
    const config = this.config as PerplexityFlowConfig;
    
    if (!config.endpoint) {
      throw new Error('Perplexity API endpoint is required');
    }
    
    if (!config.model) {
      throw new Error('Perplexity model is required');
    }
    
    // Validate model selection
    if (!Object.keys(PerplexityFlowAdapter.AVAILABLE_MODELS).includes(config.model)) {
      this.logger.warn(`Unknown model: ${config.model}. Available models:`, Object.keys(PerplexityFlowAdapter.AVAILABLE_MODELS));
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

    if (config.topK !== undefined && config.topK < 0) {
      throw new Error('topK must be 0 or greater');
    }

    if (config.presencePenalty !== undefined && (config.presencePenalty < -2 || config.presencePenalty > 2)) {
      throw new Error('presencePenalty must be between -2 and 2');
    }

    if (config.frequencyPenalty !== undefined && (config.frequencyPenalty < -2 || config.frequencyPenalty > 2)) {
      throw new Error('frequencyPenalty must be between -2 and 2');
    }
  }

  // Helper method to get available models
  static getAvailableModels(): Record<string, string> {
    return PerplexityFlowAdapter.AVAILABLE_MODELS;
  }

  // Helper method to check if web search is available for current model
  hasWebSearchCapability(): boolean {
    return this.config.webSearchEnabled && this.isOnlineModel(this.config.model!);
  }
}