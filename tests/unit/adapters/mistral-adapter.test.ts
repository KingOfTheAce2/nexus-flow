import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MistralFlowAdapter, MistralFlowConfig } from '../../../src/adapters/mistral-flow-adapter.js';
import { FlowType, TaskType, TaskStatus } from '../../../src/types/index.js';

describe('MistralFlowAdapter Unit Tests', () => {
  let adapter: MistralFlowAdapter;
  let mockConfig: MistralFlowConfig;

  beforeEach(() => {
    mockConfig = {
      enabled: true,
      priority: 7,
      maxConcurrentTasks: 3,
      timeout: 30000,
      retryAttempts: 2,
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
      apiKey: 'test-mistral-key',
      model: 'mistral-large-latest',
      maxTokens: 4096,
      temperature: 0.7,
      functionCallingEnabled: true
    };

    adapter = new MistralFlowAdapter(mockConfig);
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.shutdown();
    }
    jest.clearAllMocks();
  });

  describe('Basic Properties', () => {
    test('should have correct name and type', () => {
      expect(adapter.name).toBe('mistral-flow');
      expect(adapter.type).toBe(FlowType.MISTRAL);
      expect(adapter.version).toBe('1.0.0');
    });

    test('should return correct capabilities', () => {
      const capabilities = adapter.getCapabilities();
      expect(capabilities.codeGeneration).toBe(true);
      expect(capabilities.orchestration).toBe(true);
      expect(capabilities.hiveMind).toBe(false);
      expect(capabilities.webAuth).toBe(true);
    });

    test('should have correct initial status', () => {
      expect(adapter.getStatus()).toBe('offline');
      expect(adapter.getCurrentLoad()).toBe(0);
      expect(adapter.getMaxLoad()).toBe(3);
      expect(adapter.canAcceptTask()).toBe(false);
    });
  });

  describe('Configuration Validation', () => {
    test('should validate required configuration', () => {
      expect(() => {
        new MistralFlowAdapter({
          ...mockConfig,
          endpoint: ''
        });
      }).toThrow('Mistral API endpoint is required');
    });

    test('should validate model configuration', () => {
      expect(() => {
        new MistralFlowAdapter({
          ...mockConfig,
          model: ''
        });
      }).toThrow('Mistral model is required');
    });

    test('should validate temperature range', () => {
      expect(() => {
        new MistralFlowAdapter({
          ...mockConfig,
          temperature: 3.0 // Invalid range
        });
      }).toThrow('Temperature must be between 0 and 2');
    });

    test('should validate topP range', () => {
      expect(() => {
        new MistralFlowAdapter({
          ...mockConfig,
          topP: 1.5 // Invalid range
        });
      }).toThrow('topP must be between 0 and 1');
    });

    test('should validate maxTokens', () => {
      expect(() => {
        new MistralFlowAdapter({
          ...mockConfig,
          maxTokens: -1 // Invalid value
        });
      }).toThrow('maxTokens must be greater than 0');
    });
  });

  describe('Authentication', () => {
    test('should check authentication status with API key', () => {
      expect(adapter.isAuthenticated()).toBe(true);
    });

    test('should check authentication status with environment variable', () => {
      const adapterWithoutKey = new MistralFlowAdapter({
        ...mockConfig,
        apiKey: undefined
      });

      process.env.MISTRAL_API_KEY = 'env-key';
      expect(adapterWithoutKey.isAuthenticated()).toBe(true);

      delete process.env.MISTRAL_API_KEY;
      expect(adapterWithoutKey.isAuthenticated()).toBe(false);
    });

    test('should return correct auth URL', () => {
      expect(adapter.getAuthUrl()).toBe('https://console.mistral.ai/api-keys');
    });

    test('should handle web authentication flow', async () => {
      const mockOpenAuthUrl = jest.fn().mockResolvedValue(undefined);
      adapter['openAuthUrl'] = mockOpenAuthUrl;

      const result = await adapter.authenticate();
      expect(result).toBe(true); // Already authenticated
    });
  });

  describe('Task Processing Logic', () => {
    test('should determine if task requires function calling', () => {
      const codeTask = {
        id: 'code-1',
        description: 'Execute a Python script',
        type: TaskType.CODE_GENERATION,
        priority: 5,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const orchestrationTask = {
        id: 'orch-1',
        description: 'Coordinate with other systems',
        type: TaskType.ORCHESTRATION,
        priority: 8,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const documentationTask = {
        id: 'doc-1',
        description: 'Write documentation for API',
        type: TaskType.DOCUMENTATION,
        priority: 3,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Access private method for testing
      const requiresTools = (adapter as any).requiresFunctionCalling;
      expect(requiresTools(codeTask)).toBe(true);
      expect(requiresTools(orchestrationTask)).toBe(true);
      expect(requiresTools(documentationTask)).toBe(false);
    });

    test('should build correct system prompt', () => {
      const task = {
        id: 'test-1',
        description: 'Generate a function',
        type: TaskType.CODE_GENERATION,
        priority: 7,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const context = {
        taskId: 'test-1',
        workingDirectory: '/test/dir',
        environmentVars: { NODE_ENV: 'test' }
      };

      const systemPrompt = (adapter as any).buildSystemPrompt(task, context);
      expect(systemPrompt).toContain('Mistral AI');
      expect(systemPrompt).toContain('CODE_GENERATION');
      expect(systemPrompt).toContain('/test/dir');
      expect(systemPrompt).toContain('function calls');
    });

    test('should build user prompt correctly', () => {
      const task = {
        id: 'test-1',
        description: 'Create a calculator function',
        type: TaskType.CODE_GENERATION,
        priority: 5,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { language: 'python', complexity: 'simple' }
      };

      const userPrompt = (adapter as any).buildUserPrompt(task);
      expect(userPrompt).toContain('Create a calculator function');
      expect(userPrompt).toContain('"language": "python"');
      expect(userPrompt).toContain('"complexity": "simple"');
    });
  });

  describe('Function Call Handling', () => {
    test('should have defined agentic functions', () => {
      const functions = (adapter as any).agenticFunctions;
      expect(functions).toBeDefined();
      expect(functions.length).toBeGreaterThan(0);
      
      const functionNames = functions.map((f: any) => f.name);
      expect(functionNames).toContain('execute_code');
      expect(functionNames).toContain('file_operations');
      expect(functionNames).toContain('web_search');
      expect(functionNames).toContain('workflow_coordinate');
    });

    test('should handle execute_code function', async () => {
      const executeCodeFunction = (adapter as any).executeCodeFunction;
      const result = await executeCodeFunction({
        language: 'python',
        code: 'print("Hello, World!")'
      });

      expect(result).toContain('Code execution requested');
      expect(result).toContain('python');
    });

    test('should handle file_operations function', async () => {
      const fileOpsFunction = (adapter as any).executeFileOperation;
      const result = await fileOpsFunction({
        operation: 'read',
        path: '/test/file.txt'
      });

      expect(result).toContain('File operation');
      expect(result).toContain('read');
      expect(result).toContain('/test/file.txt');
    });

    test('should handle workflow_coordinate function', async () => {
      const coordinateFunction = (adapter as any).executeWorkflowCoordination;
      const mockEmit = jest.spyOn(adapter, 'emit');

      const result = await coordinateFunction({
        target_flow: 'claude-flow',
        task_description: 'Review code',
        priority: 8
      });

      expect(result).toContain('Workflow coordination initiated');
      expect(result).toContain('claude-flow');
      expect(mockEmit).toHaveBeenCalledWith('workflow-coordination', {
        targetFlow: 'claude-flow',
        taskDescription: 'Review code',
        priority: 8
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors correctly', () => {
      const handleError = (adapter as any).handleMistralError;

      // Test different error scenarios
      const authError = {
        response: { status: 401, data: { message: 'Invalid API key' } }
      };
      expect(handleError(authError)).toContain('Authentication failed');

      const rateLimitError = {
        response: { status: 429 }
      };
      expect(handleError(rateLimitError)).toContain('Rate limit exceeded');

      const connectionError = {
        code: 'ECONNREFUSED'
      };
      expect(handleError(connectionError)).toContain('Cannot connect to Mistral API');

      const unknownError = {
        message: 'Unknown error'
      };
      expect(handleError(unknownError)).toBe('Unknown error');
    });

    test('should handle task execution errors', async () => {
      // Mock initialization
      jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
      await adapter.initialize();

      const task = {
        id: 'error-task',
        description: 'This will fail',
        type: TaskType.CODE_GENERATION,
        priority: 5,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock HTTP client to throw error
      const mockPost = jest.fn().mockRejectedValue(new Error('API Error'));
      (adapter as any).httpClient.post = mockPost;

      const result = await adapter.executeTask(task);
      expect(result.success).toBe(false);
      expect(result.error).toContain('API Error');
      expect(result.executedBy).toBe('mistral-flow');
    });
  });

  describe('Load Management', () => {
    test('should track concurrent tasks correctly', async () => {
      jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
      await adapter.initialize();

      expect(adapter.getCurrentLoad()).toBe(0);
      expect(adapter.canAcceptTask()).toBe(true);

      // Simulate incrementing load
      (adapter as any).incrementLoad();
      expect(adapter.getCurrentLoad()).toBe(1);
      expect(adapter.canAcceptTask()).toBe(true);

      // Simulate reaching max load
      (adapter as any).incrementLoad();
      (adapter as any).incrementLoad();
      expect(adapter.getCurrentLoad()).toBe(3);
      expect(adapter.canAcceptTask()).toBe(false);

      // Simulate decrementing load
      (adapter as any).decrementLoad();
      expect(adapter.getCurrentLoad()).toBe(2);
      expect(adapter.canAcceptTask()).toBe(true);
    });

    test('should emit load change events', (done) => {
      adapter.on('load-changed', (event) => {
        expect(event.adapter).toBe('mistral-flow');
        expect(event.currentLoad).toBe(1);
        expect(event.maxLoad).toBe(3);
        done();
      });

      (adapter as any).incrementLoad();
    });

    test('should emit status change events', (done) => {
      adapter.on('status-changed', (event) => {
        expect(event.adapter).toBe('mistral-flow');
        expect(event.newStatus).toBe('available');
        expect(event.oldStatus).toBe('offline');
        done();
      });

      (adapter as any).setStatus('available');
    });
  });

  describe('HTTP Interceptors', () => {
    test('should have request and response interceptors', () => {
      const httpClient = (adapter as any).httpClient;
      expect(httpClient.interceptors.request.handlers).toBeDefined();
      expect(httpClient.interceptors.response.handlers).toBeDefined();
    });
  });

  describe('Retry Logic', () => {
    test('should retry failed operations', async () => {
      let attempts = 0;
      const mockOperation = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'Success';
      });

      const executeWithRetry = (adapter as any).executeWithRetry;
      const result = await executeWithRetry(mockOperation, 'test-task');

      expect(result).toBe('Success');
      expect(attempts).toBe(3);
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    test('should fail after max retry attempts', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      const executeWithRetry = (adapter as any).executeWithRetry;

      await expect(executeWithRetry(mockOperation, 'test-task')).rejects.toThrow('Persistent failure');
      expect(mockOperation).toHaveBeenCalledTimes(2); // retryAttempts is 2
    });
  });
});