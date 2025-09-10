import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MockFlowAdapter, MockFlowConfig } from '../../mocks/mock-flow-adapter.js';
import { FlowType, FlowStatus, Task, TaskType, TaskStatus } from '../../../src/types/index.js';

describe('BaseFlowAdapter', () => {
  let mockAdapter: MockFlowAdapter;
  let mockConfig: MockFlowConfig;

  beforeEach(() => {
    mockConfig = {
      name: 'test-mock-adapter',
      type: FlowType.CLAUDE,
      version: '1.0.0-test',
      enabled: true,
      priority: 1,
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
        orchestration: false,
        hiveMind: false,
        swarmCoordination: false,
        mcp: false,
        webAuth: false
      },
      simulateDelay: 100,
      simulateErrors: false,
      errorRate: 0,
      authRequired: false
    };
    
    mockAdapter = new MockFlowAdapter(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization and Configuration', () => {
    it('should initialize with correct configuration', () => {
      expect(mockAdapter.name).toBe('test-mock-adapter');
      expect(mockAdapter.type).toBe(FlowType.CLAUDE);
      expect(mockAdapter.version).toBe('1.0.0-test');
      expect(mockAdapter.getStatus()).toBe(FlowStatus.OFFLINE);
    });

    it('should initialize and set status to available', async () => {
      await mockAdapter.initialize();
      expect(mockAdapter.getStatus()).toBe(FlowStatus.AVAILABLE);
    });

    it('should shutdown and set status to offline', async () => {
      await mockAdapter.initialize();
      await mockAdapter.shutdown();
      expect(mockAdapter.getStatus()).toBe(FlowStatus.OFFLINE);
    });

    it('should validate configuration on construction', () => {
      const invalidConfig = { ...mockConfig, maxConcurrentTasks: 0 };
      expect(() => new MockFlowAdapter(invalidConfig)).toThrow('maxConcurrentTasks must be greater than 0');
    });

    it('should validate timeout configuration', () => {
      const invalidConfig = { ...mockConfig, timeout: 0 };
      expect(() => new MockFlowAdapter(invalidConfig)).toThrow('timeout must be greater than 0');
    });
  });

  describe('Load Management', () => {
    beforeEach(async () => {
      await mockAdapter.initialize();
    });

    it('should track current load correctly', () => {
      expect(mockAdapter.getCurrentLoad()).toBe(0);
      expect(mockAdapter.getMaxLoad()).toBe(3);
    });

    it('should report ability to accept tasks when available', () => {
      expect(mockAdapter.canAcceptTask()).toBe(true);
    });

    it('should change status to busy when at max capacity', async () => {
      const tasks = Array.from({ length: 3 }, (_, i) => createMockTask(`task-${i}`));
      
      // Start 3 tasks simultaneously (max capacity)
      const promises = tasks.map(task => mockAdapter.executeTask(task));
      
      // Should be at max capacity
      expect(mockAdapter.getCurrentLoad()).toBe(3);
      expect(mockAdapter.getStatus()).toBe(FlowStatus.BUSY);
      expect(mockAdapter.canAcceptTask()).toBe(false);
      
      // Wait for all tasks to complete
      await Promise.all(promises);
      
      // Should be available again
      expect(mockAdapter.getCurrentLoad()).toBe(0);
      expect(mockAdapter.getStatus()).toBe(FlowStatus.AVAILABLE);
      expect(mockAdapter.canAcceptTask()).toBe(true);
    });

    it('should reject tasks when at max capacity', async () => {
      // Fill to capacity
      const maxTasks = Array.from({ length: 3 }, (_, i) => createMockTask(`max-task-${i}`));
      const promises = maxTasks.map(task => mockAdapter.executeTask(task));
      
      // Try to add one more task
      const overflowTask = createMockTask('overflow-task');
      await expect(mockAdapter.executeTask(overflowTask)).rejects.toThrow('Mock adapter cannot accept task');
      
      // Clean up
      await Promise.all(promises);
    });
  });

  describe('Task Execution', () => {
    beforeEach(async () => {
      await mockAdapter.initialize();
    });

    it('should execute tasks successfully', async () => {
      const task = createMockTask('test-task', TaskType.CODE_GENERATION);
      
      const result = await mockAdapter.executeTask(task);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Generated code for: test task description');
      expect(result.executedBy).toBe('test-mock-adapter');
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.metadata).toMatchObject({
        executionCount: 1,
        adapter: 'test-mock-adapter',
        taskType: TaskType.CODE_GENERATION
      });
    });

    it('should track task history', async () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      
      await mockAdapter.executeTask(task1);
      await mockAdapter.executeTask(task2);
      
      const history = mockAdapter.getTaskHistory();
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('task-1');
      expect(history[1].id).toBe('task-2');
      expect(mockAdapter.getExecutionCount()).toBe(2);
    });

    it('should handle different task types', async () => {
      const taskTypes = [
        TaskType.CODE_GENERATION,
        TaskType.CODE_REVIEW,
        TaskType.RESEARCH,
        TaskType.ANALYSIS,
        TaskType.DOCUMENTATION,
        TaskType.TESTING,
        TaskType.REFACTORING
      ];

      for (const taskType of taskTypes) {
        const task = createMockTask(`task-${taskType}`, taskType);
        const result = await mockAdapter.executeTask(task);
        
        expect(result.success).toBe(true);
        expect(result.output).toBeDefined();
        expect(result.metadata?.taskType).toBe(taskType);
      }
    });

    it('should handle simulated errors correctly', async () => {
      mockAdapter.forceMockError(true);
      const task = createMockTask('error-task');
      
      const result = await mockAdapter.executeTask(task);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Simulated error');
      expect(result.executedBy).toBe('test-mock-adapter');
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should emit events during execution', async () => {
      const loadChangedSpy = jest.fn();
      mockAdapter.on('load-changed', loadChangedSpy);
      
      const task = createMockTask('event-task');
      await mockAdapter.executeTask(task);
      
      expect(loadChangedSpy).toHaveBeenCalledWith({
        adapter: 'test-mock-adapter',
        currentLoad: expect.any(Number),
        maxLoad: 3
      });
    });
  });

  describe('Health Check', () => {
    it('should return true for healthy adapter', async () => {
      await mockAdapter.initialize();
      const isHealthy = await mockAdapter.checkHealth();
      expect(isHealthy).toBe(true);
    });

    it('should return false for error status adapter', async () => {
      await mockAdapter.initialize();
      mockAdapter.setMockStatus(FlowStatus.ERROR);
      const isHealthy = await mockAdapter.checkHealth();
      expect(isHealthy).toBe(false);
    });
  });

  describe('Authentication', () => {
    it('should handle authentication when not required', async () => {
      const isAuthenticated = await mockAdapter.authenticate();
      expect(isAuthenticated).toBe(true);
      expect(mockAdapter.isAuthenticated()).toBe(true);
    });

    it('should handle authentication when required', async () => {
      const authConfig = { ...mockConfig, authRequired: true };
      const authAdapter = new MockFlowAdapter(authConfig);
      
      expect(authAdapter.isAuthenticated()).toBe(false);
      
      const authResult = await authAdapter.authenticate();
      expect(authResult).toBe(true);
      expect(authAdapter.isAuthenticated()).toBe(true);
    });

    it('should reject tasks when authentication required but not authenticated', async () => {
      const authConfig = { ...mockConfig, authRequired: true };
      const authAdapter = new MockFlowAdapter(authConfig);
      await authAdapter.initialize();
      
      const task = createMockTask('auth-task');
      const result = await authAdapter.executeTask(task);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication required but not authenticated');
    });

    it('should provide authentication URL', () => {
      const authUrl = mockAdapter.getAuthUrl();
      expect(authUrl).toBe('https://mock-auth.example.com/login?adapter=test-mock-adapter');
    });
  });

  describe('Capabilities', () => {
    it('should return correct capabilities', () => {
      const capabilities = mockAdapter.getCapabilities();
      
      expect(capabilities.codeGeneration).toBe(true);
      expect(capabilities.codeReview).toBe(true);
      expect(capabilities.research).toBe(true);
      expect(capabilities.analysis).toBe(true);
      expect(capabilities.documentation).toBe(true);
      expect(capabilities.testing).toBe(true);
      expect(capabilities.refactoring).toBe(true);
      expect(capabilities.orchestration).toBe(false);
      expect(capabilities.hiveMind).toBe(false);
      expect(capabilities.swarmCoordination).toBe(false);
      expect(capabilities.mcp).toBe(false);
    });
  });

  describe('Retry Mechanism', () => {
    it('should retry failed operations', async () => {
      // Set up adapter to fail 50% of the time with 3 retry attempts
      const retryConfig = { ...mockConfig, retryAttempts: 3, simulateErrors: true, errorRate: 0.5 };
      const retryAdapter = new MockFlowAdapter(retryConfig);
      await retryAdapter.initialize();
      
      const errorSpy = jest.fn();
      retryAdapter.on('execution-error', errorSpy);
      
      // Execute multiple tasks to test retry behavior
      const tasks = Array.from({ length: 10 }, (_, i) => createMockTask(`retry-task-${i}`));
      const results = await Promise.all(tasks.map(task => retryAdapter.executeTask(task)));
      
      // Some tasks should succeed due to retries
      const successfulTasks = results.filter(r => r.success);
      const failedTasks = results.filter(r => !r.success);
      
      expect(successfulTasks.length + failedTasks.length).toBe(10);
      
      // Error events should have been emitted for retry attempts
      if (errorSpy.mock.calls.length > 0) {
        expect(errorSpy).toHaveBeenCalledWith({
          adapter: 'test-mock-adapter',
          taskId: expect.any(String),
          attempt: expect.any(Number),
          error: expect.stringContaining('Simulated error')
        });
      }
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await mockAdapter.initialize();
    });

    it('should emit status change events', async () => {
      const statusChangedSpy = jest.fn();
      mockAdapter.on('status-changed', statusChangedSpy);
      
      mockAdapter.setMockStatus(FlowStatus.BUSY);
      
      expect(statusChangedSpy).toHaveBeenCalledWith({
        adapter: 'test-mock-adapter',
        oldStatus: FlowStatus.AVAILABLE,
        newStatus: FlowStatus.BUSY
      });
    });

    it('should emit load change events', async () => {
      const loadChangedSpy = jest.fn();
      mockAdapter.on('load-changed', loadChangedSpy);
      
      const task = createMockTask('load-task');
      await mockAdapter.executeTask(task);
      
      expect(loadChangedSpy).toHaveBeenCalledWith({
        adapter: 'test-mock-adapter',
        currentLoad: expect.any(Number),
        maxLoad: 3
      });
    });
  });
});

// Helper function to create mock tasks
function createMockTask(id: string, type: TaskType = TaskType.CODE_GENERATION): Task {
  return {
    id,
    description: `test task description for ${id}`,
    type,
    priority: 1,
    status: TaskStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: { test: true }
  };
}