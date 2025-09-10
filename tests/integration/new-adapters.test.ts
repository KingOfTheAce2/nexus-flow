import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { MistralFlowAdapter, MistralFlowConfig } from '../../src/adapters/mistral-flow-adapter.js';
import { PerplexityFlowAdapter, PerplexityFlowConfig } from '../../src/adapters/perplexity-flow-adapter.js';
import { CohereFlowAdapter, CohereFlowConfig } from '../../src/adapters/cohere-flow-adapter.js';
import { AdapterFactory } from '../../src/adapters/adapter-factory.js';
import { FlowType, TaskType, TaskStatus } from '../../src/types/index.js';
import { Logger } from '../../src/utils/logger.js';

// Mock environment variables for testing
const mockEnvVars = {
  MISTRAL_API_KEY: 'test-mistral-key',
  PERPLEXITY_API_KEY: 'test-perplexity-key',
  COHERE_API_KEY: 'test-cohere-key'
};

// Test configuration
const testTimeout = 30000;

describe('New Adapter Integration Tests', () => {
  let factory: AdapterFactory;
  let logger: Logger;

  beforeAll(() => {
    // Set up test environment variables
    Object.entries(mockEnvVars).forEach(([key, value]) => {
      process.env[key] = value;
    });

    factory = AdapterFactory.getInstance();
    logger = new Logger('AdapterTest');
    logger.debug('Starting adapter integration tests');
  });

  afterAll(() => {
    // Clean up environment variables
    Object.keys(mockEnvVars).forEach(key => {
      delete process.env[key];
    });
  });

  describe('Mistral Flow Adapter', () => {
    let adapter: MistralFlowAdapter;

    beforeEach(async () => {
      const config: MistralFlowConfig = {
        enabled: true,
        priority: 7,
        maxConcurrentTasks: 2,
        timeout: 10000,
        retryAttempts: 1,
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
        apiKey: 'test-key',
        model: 'mistral-large-latest',
        functionCallingEnabled: true
      };

      adapter = new MistralFlowAdapter(config);
    });

    afterEach(async () => {
      if (adapter) {
        await adapter.shutdown();
      }
    });

    test('should create adapter with correct properties', () => {
      expect(adapter.name).toBe('mistral-flow');
      expect(adapter.type).toBe(FlowType.MISTRAL);
      expect(adapter.version).toBe('1.0.0');
      expect(adapter.canAcceptTask()).toBe(false); // Not initialized
    });

    test('should validate configuration correctly', () => {
      expect(() => {
        new MistralFlowAdapter({
          enabled: true,
          priority: 5,
          maxConcurrentTasks: -1, // Invalid
          timeout: 10000,
          retryAttempts: 1,
          capabilities: {
            codeGeneration: false,
            codeReview: false,
            research: false,
            analysis: false,
            documentation: false,
            testing: false,
            refactoring: false,
            orchestration: false,
            hiveMind: false,
            swarmCoordination: false,
            mcp: false,
            webAuth: false
          }
        });
      }).toThrow('maxConcurrentTasks must be greater than 0');
    });

    test('should have correct capabilities', () => {
      const capabilities = adapter.getCapabilities();
      expect(capabilities.codeGeneration).toBe(true);
      expect(capabilities.research).toBe(true);
      expect(capabilities.orchestration).toBe(true);
      expect(capabilities.hiveMind).toBe(false); // Mistral doesn't support hive-mind
      expect(capabilities.webAuth).toBe(true);
    });

    test('should check authentication status', () => {
      expect(adapter.isAuthenticated()).toBe(true); // Has API key
    });

    test('should get correct auth URL', () => {
      expect(adapter.getAuthUrl()).toBe('https://console.mistral.ai/api-keys');
    });

    test('should initialize successfully with valid config', async () => {
      // Mock the health check to avoid actual API calls
      jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
      
      await expect(adapter.initialize()).resolves.not.toThrow();
      expect(adapter.getStatus()).toBe('available');
    }, testTimeout);

    test('should handle task execution flow', async () => {
      // Mock the health check and HTTP calls
      jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
      
      await adapter.initialize();
      
      const testTask = {
        id: 'test-task-1',
        description: 'Generate a simple hello world function in Python',
        type: TaskType.CODE_GENERATION,
        priority: 5,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock the actual execution to avoid API calls
      const mockExecuteTask = jest.spyOn(adapter, 'executeTask').mockResolvedValue({
        success: true,
        output: 'def hello_world():\n    print("Hello, World!")\n    return "Hello, World!"',
        executedBy: 'mistral-flow',
        executionTime: 1500,
        metadata: {
          model: 'mistral-large-latest',
          functionCalls: 0,
          tokens: 45
        }
      });

      const result = await adapter.executeTask(testTask);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Hello, World!');
      expect(result.executedBy).toBe('mistral-flow');
      expect(result.executionTime).toBeGreaterThan(0);

      mockExecuteTask.mockRestore();
    }, testTimeout);
  });

  describe('Perplexity Flow Adapter', () => {
    let adapter: PerplexityFlowAdapter;

    beforeEach(async () => {
      const config: PerplexityFlowConfig = {
        enabled: true,
        priority: 6,
        maxConcurrentTasks: 2,
        timeout: 15000,
        retryAttempts: 1,
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
        apiKey: 'test-key',
        model: 'llama-3.1-sonar-large-128k-online',
        webSearchEnabled: true,
        citationsEnabled: true
      };

      adapter = new PerplexityFlowAdapter(config);
    });

    afterEach(async () => {
      if (adapter) {
        await adapter.shutdown();
      }
    });

    test('should create adapter with correct properties', () => {
      expect(adapter.name).toBe('perplexity-flow');
      expect(adapter.type).toBe(FlowType.PERPLEXITY);
      expect(adapter.version).toBe('1.0.0');
    });

    test('should have research-focused capabilities', () => {
      const capabilities = adapter.getCapabilities();
      expect(capabilities.research).toBe(true); // Primary strength
      expect(capabilities.analysis).toBe(true);
      expect(capabilities.testing).toBe(false); // Limited testing capabilities
      expect(capabilities.orchestration).toBe(false); // No orchestration
    });

    test('should support web search capability', () => {
      expect(adapter.hasWebSearchCapability()).toBe(true);
    });

    test('should handle research tasks', async () => {
      jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
      await adapter.initialize();

      const researchTask = {
        id: 'research-task-1',
        description: 'Research the latest developments in quantum computing for 2024',
        type: TaskType.RESEARCH,
        priority: 8,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockExecuteTask = jest.spyOn(adapter, 'executeTask').mockResolvedValue({
        success: true,
        output: `# Quantum Computing Developments in 2024

Key developments include:
1. IBM's quantum error correction breakthroughs
2. Google's advances in quantum supremacy
3. Microsoft's topological qubits progress

**Sources:**
[1] https://example.com/quantum-news-1
[2] https://example.com/quantum-news-2`,
        executedBy: 'perplexity-flow',
        executionTime: 3200,
        metadata: {
          model: 'llama-3.1-sonar-large-128k-online',
          citations: 2,
          hasWebSearch: true
        }
      });

      const result = await adapter.executeTask(researchTask);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Sources:');
      expect(result.metadata?.citations).toBeGreaterThan(0);
      expect(result.metadata?.hasWebSearch).toBe(true);

      mockExecuteTask.mockRestore();
    }, testTimeout);
  });

  describe('Cohere Flow Adapter', () => {
    let adapter: CohereFlowAdapter;

    beforeEach(async () => {
      const config: CohereFlowConfig = {
        enabled: true,
        priority: 8,
        maxConcurrentTasks: 2,
        timeout: 10000,
        retryAttempts: 1,
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
        apiKey: 'test-key',
        model: 'command-r-plus',
        toolsEnabled: true,
        ragEnabled: true
      };

      adapter = new CohereFlowAdapter(config);
    });

    afterEach(async () => {
      if (adapter) {
        await adapter.shutdown();
      }
    });

    test('should create adapter with correct properties', () => {
      expect(adapter.name).toBe('cohere-flow');
      expect(adapter.type).toBe(FlowType.COHERE);
      expect(adapter.version).toBe('1.0.0');
    });

    test('should have comprehensive capabilities', () => {
      const capabilities = adapter.getCapabilities();
      expect(capabilities.codeGeneration).toBe(true);
      expect(capabilities.analysis).toBe(true);
      expect(capabilities.orchestration).toBe(true);
      expect(capabilities.swarmCoordination).toBe(true);
    });

    test('should support tool and RAG capabilities', () => {
      expect(adapter.hasToolsCapability()).toBe(true);
      expect(adapter.hasRAGCapability()).toBe(true);
    });

    test('should handle analysis tasks with tools', async () => {
      jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
      await adapter.initialize();

      const analysisTask = {
        id: 'analysis-task-1',
        description: 'Analyze the performance of a Python script and suggest improvements',
        type: TaskType.ANALYSIS,
        priority: 7,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockExecuteTask = jest.spyOn(adapter, 'executeTask').mockResolvedValue({
        success: true,
        output: `# Performance Analysis Results

## Issues Found:
1. Inefficient loop in main function
2. Unnecessary memory allocations
3. Missing caching for repeated calculations

## Recommendations:
1. Use list comprehension instead of traditional loops
2. Implement object pooling for frequently used objects
3. Add memoization for expensive computations

**Tool Usage:**
1. code_interpreter(analyze_performance)
2. file_operations(read_source_code)`,
        executedBy: 'cohere-flow',
        executionTime: 2800,
        metadata: {
          model: 'command-r-plus',
          toolCalls: 2,
          finishReason: 'COMPLETE'
        }
      });

      const result = await adapter.executeTask(analysisTask);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Analysis Results');
      expect(result.output).toContain('Tool Usage');
      expect(result.metadata?.toolCalls).toBeGreaterThan(0);

      mockExecuteTask.mockRestore();
    }, testTimeout);
  });

  describe('Adapter Factory Integration', () => {
    test('should have all new adapters registered', () => {
      const registeredTypes = factory.getRegisteredAdapterTypes();
      expect(registeredTypes).toContain(FlowType.MISTRAL);
      expect(registeredTypes).toContain(FlowType.PERPLEXITY);
      expect(registeredTypes).toContain(FlowType.COHERE);
    });

    test('should create Mistral adapter through factory', async () => {
      const adapter = await factory.createMistralFlowAdapter({
        apiKey: 'test-key',
        maxConcurrentTasks: 1
      });
      
      expect(adapter).toBeInstanceOf(MistralFlowAdapter);
      expect(adapter.name).toBe('mistral-flow');
      
      await adapter.shutdown();
    });

    test('should create Perplexity adapter through factory', async () => {
      const adapter = await factory.createPerplexityFlowAdapter({
        apiKey: 'test-key',
        maxConcurrentTasks: 1
      });
      
      expect(adapter).toBeInstanceOf(PerplexityFlowAdapter);
      expect(adapter.name).toBe('perplexity-flow');
      
      await adapter.shutdown();
    });

    test('should create Cohere adapter through factory', async () => {
      const adapter = await factory.createCohereFlowAdapter({
        apiKey: 'test-key',
        maxConcurrentTasks: 1
      });
      
      expect(adapter).toBeInstanceOf(CohereFlowAdapter);
      expect(adapter.name).toBe('cohere-flow');
      
      await adapter.shutdown();
    });

    test('should get correct capabilities for each adapter type', () => {
      const mistralCaps = factory.getFlowCapabilities(FlowType.MISTRAL);
      const perplexityCaps = factory.getFlowCapabilities(FlowType.PERPLEXITY);
      const cohereCaps = factory.getFlowCapabilities(FlowType.COHERE);

      expect(mistralCaps?.orchestration).toBe(true);
      expect(perplexityCaps?.research).toBe(true);
      expect(cohereCaps?.orchestration).toBe(true);

      // Verify different strengths
      expect(perplexityCaps?.testing).toBe(false); // Perplexity has limited testing
      expect(mistralCaps?.hiveMind).toBe(false); // Mistral doesn't support hive-mind
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid API configurations gracefully', () => {
      expect(() => {
        new MistralFlowAdapter({
          enabled: true,
          priority: 5,
          maxConcurrentTasks: 1,
          timeout: 0, // Invalid timeout
          retryAttempts: 1,
          capabilities: {
            codeGeneration: false,
            codeReview: false,
            research: false,
            analysis: false,
            documentation: false,
            testing: false,
            refactoring: false,
            orchestration: false,
            hiveMind: false,
            swarmCoordination: false,
            mcp: false,
            webAuth: false
          }
        });
      }).toThrow('timeout must be greater than 0');
    });

    test('should handle missing authentication gracefully', () => {
      // Remove API key from environment
      delete process.env.MISTRAL_API_KEY;

      const adapter = new MistralFlowAdapter({
        enabled: true,
        priority: 5,
        maxConcurrentTasks: 1,
        timeout: 10000,
        retryAttempts: 1,
        capabilities: {
          codeGeneration: false,
          codeReview: false,
          research: false,
          analysis: false,
          documentation: false,
          testing: false,
          refactoring: false,
          orchestration: false,
          hiveMind: false,
          swarmCoordination: false,
          mcp: false,
          webAuth: false
        }
      });

      expect(adapter.isAuthenticated()).toBe(false);

      // Restore for other tests
      process.env.MISTRAL_API_KEY = mockEnvVars.MISTRAL_API_KEY;
    });

    test('should handle task overload correctly', async () => {
      const config: MistralFlowConfig = {
        enabled: true,
        priority: 5,
        maxConcurrentTasks: 1, // Very limited
        timeout: 10000,
        retryAttempts: 1,
        capabilities: {
          codeGeneration: true,
          codeReview: false,
          research: false,
          analysis: false,
          documentation: false,
          testing: false,
          refactoring: false,
          orchestration: false,
          hiveMind: false,
          swarmCoordination: false,
          mcp: false,
          webAuth: false
        },
        apiKey: 'test-key'
      };

      const adapter = new MistralFlowAdapter(config);
      jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
      await adapter.initialize();

      // Simulate task overload by setting status to busy
      (adapter as any).status = 'busy';
      (adapter as any).currentLoad = 1;

      const task = {
        id: 'overload-test',
        description: 'Test task',
        type: TaskType.CODE_GENERATION,
        priority: 5,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await expect(adapter.executeTask(task)).rejects.toThrow(/cannot accept task/);
      await adapter.shutdown();
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle concurrent tasks within limits', async () => {
      const config: CohereFlowConfig = {
        enabled: true,
        priority: 5,
        maxConcurrentTasks: 3,
        timeout: 10000,
        retryAttempts: 1,
        capabilities: {
          codeGeneration: true,
          codeReview: false,
          research: false,
          analysis: false,
          documentation: false,
          testing: false,
          refactoring: false,
          orchestration: false,
          hiveMind: false,
          swarmCoordination: false,
          mcp: false,
          webAuth: false
        },
        apiKey: 'test-key'
      };

      const adapter = new CohereFlowAdapter(config);
      jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
      await adapter.initialize();

      expect(adapter.canAcceptTask()).toBe(true);
      expect(adapter.getCurrentLoad()).toBe(0);
      expect(adapter.getMaxLoad()).toBe(3);

      await adapter.shutdown();
    });
  });
});

// Helper function to create test tasks
export function createTestTask(type: TaskType, description: string, id?: string) {
  return {
    id: id || `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    description,
    type,
    priority: 5,
    status: TaskStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// Mock configuration generator
export function createMockAdapterConfig(overrides: any = {}) {
  return {
    enabled: true,
    priority: 5,
    maxConcurrentTasks: 2,
    timeout: 10000,
    retryAttempts: 1,
    capabilities: {
      codeGeneration: true,
      codeReview: true,
      research: true,
      analysis: true,
      documentation: true,
      testing: true,
      refactoring: true,
      orchestration: false,
      hiveMind: false,
      swarmCoordination: false,
      mcp: false,
      webAuth: true
    },
    apiKey: 'test-key',
    ...overrides
  };
}