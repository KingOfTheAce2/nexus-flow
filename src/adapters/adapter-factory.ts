import { BaseFlowAdapter, FlowAdapterConfig } from './base-flow-adapter.js';
import { ClaudeFlowAdapter, ClaudeFlowConfig } from './claude-flow-adapter.js';
import { GeminiFlowAdapter, GeminiFlowConfig } from './gemini-flow-adapter.js';
import { MistralFlowAdapter, MistralFlowConfig } from './mistral-flow-adapter.js';
import { PerplexityFlowAdapter, PerplexityFlowConfig } from './perplexity-flow-adapter.js';
import { CohereFlowAdapter, CohereFlowConfig } from './cohere-flow-adapter.js';
import { FlowType } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export interface AdapterRegistration {
  type: FlowType;
  name: string;
  version: string;
  adapterClass: new (config: FlowAdapterConfig) => BaseFlowAdapter;
  defaultConfig: Partial<FlowAdapterConfig>;
}

export class AdapterFactory {
  private static instance: AdapterFactory;
  private logger: Logger;
  private registeredAdapters: Map<FlowType, AdapterRegistration> = new Map();
  private activeAdapters: Map<string, BaseFlowAdapter> = new Map();

  private constructor() {
    this.logger = new Logger('AdapterFactory');
    this.registerBuiltInAdapters();
  }

  static getInstance(): AdapterFactory {
    if (!AdapterFactory.instance) {
      AdapterFactory.instance = new AdapterFactory();
    }
    return AdapterFactory.instance;
  }

  private registerBuiltInAdapters(): void {
    // Register Claude Flow adapter
    this.registerAdapter({
      type: FlowType.CLAUDE,
      name: 'claude-flow',
      version: '2.0.0-alpha.90',
      adapterClass: ClaudeFlowAdapter,
      defaultConfig: {
        enabled: true,
        priority: 9,
        maxConcurrentTasks: 4,
        timeout: 30000,
        retryAttempts: 3,
        capabilities: {
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
        },
        authConfig: {
          type: 'web',
          webUrl: 'https://claude.ai',
          loginUrl: 'https://claude.ai/login'
        }
      }
    });

    // Register Gemini Flow adapter
    this.registerAdapter({
      type: FlowType.GEMINI,
      name: 'gemini-flow',
      version: '1.3.2',
      adapterClass: GeminiFlowAdapter,
      defaultConfig: {
        enabled: true,
        priority: 8,
        maxConcurrentTasks: 6,
        timeout: 25000,
        retryAttempts: 3,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          research: true,
          analysis: true,
          documentation: true,
          testing: true,
          refactoring: true,
          orchestration: true,
          hiveMind: false,
          swarmCoordination: true,
          mcp: true,
          webAuth: true
        },
        authConfig: {
          type: 'web',
          webUrl: 'https://aistudio.google.com',
          loginUrl: 'https://aistudio.google.com/apikey'
        }
      }
    });

    // Register Mistral Flow adapter
    this.registerAdapter({
      type: FlowType.MISTRAL,
      name: 'mistral-flow',
      version: '1.0.0',
      adapterClass: MistralFlowAdapter,
      defaultConfig: {
        enabled: true,
        priority: 7,
        maxConcurrentTasks: 5,
        timeout: 30000,
        retryAttempts: 3,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          research: true,
          analysis: true,
          documentation: true,
          testing: true,
          refactoring: true,
          orchestration: true,
          hiveMind: false,
          swarmCoordination: true,
          mcp: false,
          webAuth: true
        },
        authConfig: {
          type: 'web',
          webUrl: 'https://chat.mistral.ai',
          loginUrl: 'https://console.mistral.ai/api-keys'
        }
      }
    });

    // Register Perplexity Flow adapter
    this.registerAdapter({
      type: FlowType.PERPLEXITY,
      name: 'perplexity-flow',
      version: '1.0.0',
      adapterClass: PerplexityFlowAdapter,
      defaultConfig: {
        enabled: true,
        priority: 6,
        maxConcurrentTasks: 3,
        timeout: 45000,
        retryAttempts: 2,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          research: true, // Strongest capability
          analysis: true,
          documentation: true,
          testing: false,
          refactoring: true,
          orchestration: false,
          hiveMind: false,
          swarmCoordination: false,
          mcp: false,
          webAuth: true
        },
        authConfig: {
          type: 'web',
          webUrl: 'https://www.perplexity.ai',
          loginUrl: 'https://www.perplexity.ai/settings/api'
        }
      }
    });

    // Register Cohere Flow adapter
    this.registerAdapter({
      type: FlowType.COHERE,
      name: 'cohere-flow',
      version: '1.0.0',
      adapterClass: CohereFlowAdapter,
      defaultConfig: {
        enabled: true,
        priority: 8,
        maxConcurrentTasks: 4,
        timeout: 30000,
        retryAttempts: 3,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          research: true,
          analysis: true,
          documentation: true,
          testing: true,
          refactoring: true,
          orchestration: true,
          hiveMind: false,
          swarmCoordination: true,
          mcp: false,
          webAuth: true
        },
        authConfig: {
          type: 'web',
          webUrl: 'https://dashboard.cohere.com',
          loginUrl: 'https://dashboard.cohere.com/api-keys'
        }
      }
    });

    this.logger.info(`Registered ${this.registeredAdapters.size} built-in adapters`);
  }

  registerAdapter(registration: AdapterRegistration): void {
    this.registeredAdapters.set(registration.type, registration);
    this.logger.debug(`Registered adapter: ${registration.name} (${registration.type})`);
  }

  async createAdapter(type: FlowType, config: FlowAdapterConfig): Promise<BaseFlowAdapter> {
    const registration = this.registeredAdapters.get(type);
    if (!registration) {
      throw new Error(`No adapter registered for flow type: ${type}`);
    }

    // Merge with default config
    const mergedConfig = {
      ...registration.defaultConfig,
      ...config
    } as FlowAdapterConfig;

    try {
      const adapter = new registration.adapterClass(mergedConfig);
      
      // Store reference for management
      const adapterId = `${type}-${Date.now()}`;
      this.activeAdapters.set(adapterId, adapter);

      // Set up cleanup on adapter shutdown
      adapter.once('shutdown', () => {
        this.activeAdapters.delete(adapterId);
      });

      this.logger.info(`Created adapter: ${registration.name} (${adapterId})`);
      return adapter;

    } catch (error: any) {
      this.logger.error(`Failed to create adapter for ${type}:`, error);
      throw new Error(`Failed to create ${type} adapter: ${error.message}`);
    }
  }

  getRegisteredAdapters(): AdapterRegistration[] {
    return Array.from(this.registeredAdapters.values());
  }

  getRegisteredAdapterTypes(): FlowType[] {
    return Array.from(this.registeredAdapters.keys());
  }

  getAdapterRegistration(type: FlowType): AdapterRegistration | undefined {
    return this.registeredAdapters.get(type);
  }

  async createAdapterForFlow(
    type: FlowType, 
    customConfig: Partial<FlowAdapterConfig> = {}
  ): Promise<BaseFlowAdapter> {
    const registration = this.getAdapterRegistration(type);
    if (!registration) {
      throw new Error(`No adapter available for flow type: ${type}`);
    }

    const config: FlowAdapterConfig = {
      ...registration.defaultConfig,
      ...customConfig
    } as FlowAdapterConfig;

    return await this.createAdapter(type, config);
  }

  async createClaudeFlowAdapter(customConfig: Partial<ClaudeFlowConfig> = {}): Promise<ClaudeFlowAdapter> {
    const defaultConfig: ClaudeFlowConfig = {
      enabled: true,
      priority: 9,
      maxConcurrentTasks: 4,
      timeout: 30000,
      retryAttempts: 3,
      capabilities: {
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
      },
      useHiveMind: true,
      swarmConfig: {
        maxAgents: 4,
        topology: 'adaptive',
        consensus: 'majority'
      },
      mcpConfig: {
        enabled: true,
        tools: ['swarm_init', 'agent_spawn', 'task_orchestrate', 'memory_usage']
      },
      authConfig: {
        type: 'web',
        webUrl: 'https://claude.ai',
        loginUrl: 'https://claude.ai/login'
      }
    };

    const config = { ...defaultConfig, ...customConfig };
    return new ClaudeFlowAdapter(config);
  }

  async createGeminiFlowAdapter(customConfig: Partial<GeminiFlowConfig> = {}): Promise<GeminiFlowAdapter> {
    const defaultConfig: GeminiFlowConfig = {
      enabled: true,
      priority: 8,
      maxConcurrentTasks: 6,
      timeout: 25000,
      retryAttempts: 3,
      capabilities: {
        codeGeneration: true,
        codeReview: true,
        research: true,
        analysis: true,
        documentation: true,
        testing: true,
        refactoring: true,
        orchestration: true,
        hiveMind: false,
        swarmCoordination: true,
        mcp: true,
        webAuth: true
      },
      googleServices: {
        vertexAI: true,
        veo3: false,
        imagen4: false,
        lyria: false,
        chirp: false,
        coScientist: true,
        mariner: false,
        agentSpace: true
      },
      a2aConfig: {
        enabled: true,
        transport: 'websocket',
        encryption: true
      },
      performanceConfig: {
        sqliteOptimization: true,
        memoryPoolSize: 100,
        concurrencyLevel: 15
      },
      authConfig: {
        type: 'web',
        webUrl: 'https://aistudio.google.com',
        loginUrl: 'https://aistudio.google.com/apikey'
      }
    };

    const config = { ...defaultConfig, ...customConfig };
    return new GeminiFlowAdapter(config);
  }

  async createMistralFlowAdapter(customConfig: Partial<MistralFlowConfig> = {}): Promise<MistralFlowAdapter> {
    const defaultConfig: MistralFlowConfig = {
      enabled: true,
      priority: 7,
      maxConcurrentTasks: 5,
      timeout: 30000,
      retryAttempts: 3,
      capabilities: {
        codeGeneration: true,
        codeReview: true,
        research: true,
        analysis: true,
        documentation: true,
        testing: true,
        refactoring: true,
        orchestration: true,
        hiveMind: false,
        swarmCoordination: true,
        mcp: false,
        webAuth: true
      },
      model: 'mistral-large-latest',
      maxTokens: 4096,
      temperature: 0.7,
      functionCallingEnabled: true,
      authConfig: {
        type: 'web',
        webUrl: 'https://chat.mistral.ai',
        loginUrl: 'https://console.mistral.ai/api-keys'
      }
    };

    const config = { ...defaultConfig, ...customConfig };
    return new MistralFlowAdapter(config);
  }

  async createPerplexityFlowAdapter(customConfig: Partial<PerplexityFlowConfig> = {}): Promise<PerplexityFlowAdapter> {
    const defaultConfig: PerplexityFlowConfig = {
      enabled: true,
      priority: 6,
      maxConcurrentTasks: 3,
      timeout: 45000,
      retryAttempts: 2,
      capabilities: {
        codeGeneration: true,
        codeReview: true,
        research: true,
        analysis: true,
        documentation: true,
        testing: false,
        refactoring: true,
        orchestration: false,
        hiveMind: false,
        swarmCoordination: false,
        mcp: false,
        webAuth: true
      },
      model: 'llama-3.1-sonar-large-128k-online',
      maxTokens: 4096,
      temperature: 0.2,
      webSearchEnabled: true,
      citationsEnabled: true,
      authConfig: {
        type: 'web',
        webUrl: 'https://www.perplexity.ai',
        loginUrl: 'https://www.perplexity.ai/settings/api'
      }
    };

    const config = { ...defaultConfig, ...customConfig };
    return new PerplexityFlowAdapter(config);
  }

  async createCohereFlowAdapter(customConfig: Partial<CohereFlowConfig> = {}): Promise<CohereFlowAdapter> {
    const defaultConfig: CohereFlowConfig = {
      enabled: true,
      priority: 8,
      maxConcurrentTasks: 4,
      timeout: 30000,
      retryAttempts: 3,
      capabilities: {
        codeGeneration: true,
        codeReview: true,
        research: true,
        analysis: true,
        documentation: true,
        testing: true,
        refactoring: true,
        orchestration: true,
        hiveMind: false,
        swarmCoordination: true,
        mcp: false,
        webAuth: true
      },
      model: 'command-r-plus',
      maxTokens: 4096,
      temperature: 0.3,
      toolsEnabled: true,
      ragEnabled: true,
      webSearchEnabled: true,
      authConfig: {
        type: 'web',
        webUrl: 'https://dashboard.cohere.com',
        loginUrl: 'https://dashboard.cohere.com/api-keys'
      }
    };

    const config = { ...defaultConfig, ...customConfig };
    return new CohereFlowAdapter(config);
  }

  getActiveAdapters(): BaseFlowAdapter[] {
    return Array.from(this.activeAdapters.values());
  }

  async shutdownAllAdapters(): Promise<void> {
    this.logger.info(`Shutting down ${this.activeAdapters.size} active adapters...`);
    
    const shutdownPromises = Array.from(this.activeAdapters.values()).map(adapter => 
      adapter.shutdown().catch(error => {
        this.logger.error(`Error shutting down adapter:`, error);
      })
    );

    await Promise.all(shutdownPromises);
    this.activeAdapters.clear();
    
    this.logger.info('All adapters shut down');
  }

  // Utility method to check if a flow type is supported
  isFlowTypeSupported(type: FlowType): boolean {
    return this.registeredAdapters.has(type);
  }

  // Get adapter capabilities for a specific flow type
  getFlowCapabilities(type: FlowType): FlowAdapterConfig['capabilities'] | undefined {
    const registration = this.registeredAdapters.get(type);
    return registration?.defaultConfig.capabilities;
  }
}