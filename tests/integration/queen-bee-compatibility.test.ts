import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { QueenBee } from '../../src/core/queen-bee.js';
import { FlowRegistry } from '../../src/core/flow-registry.js';
import { Logger } from '../../src/utils/logger.js';
import { 
  Task, 
  TaskType, 
  TaskStatus, 
  DelegationStrategy, 
  QueenBeeConfig,
  FlowInstance,
  FlowStatus 
} from '../../src/types/index.js';

// Mock Logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

// Mock FlowRegistry for Queen Bee testing
class MockFlowRegistry extends FlowRegistry {
  private mockFlows = new Map<string, FlowInstance>();
  private mockResults = new Map<string, string>();
  private executionCounts = new Map<string, number>();

  addMockFlow(flow: FlowInstance): void {
    this.mockFlows.set(flow.name, flow);
  }

  setMockResult(flowName: string, result: string): void {
    this.mockResults.set(flowName, result);
  }

  get(flowName: string): FlowInstance | undefined {
    return this.mockFlows.get(flowName);
  }

  getAvailable(): FlowInstance[] {
    return Array.from(this.mockFlows.values()).filter(f => f.status === FlowStatus.AVAILABLE);
  }

  getByCapability(capability: string): FlowInstance[] {
    return Array.from(this.mockFlows.values()).filter(f => 
      f.status === FlowStatus.AVAILABLE && f.capabilities.includes(capability)
    );
  }

  async executeOnFlow(flowName: string, description: string): Promise<string> {
    const flow = this.mockFlows.get(flowName);
    if (!flow) {
      throw new Error(`Flow not found: ${flowName}`);
    }
    if (flow.status !== FlowStatus.AVAILABLE) {
      throw new Error(`Flow not available: ${flowName} (status: ${flow.status})`);
    }

    // Track execution count
    const count = this.executionCounts.get(flowName) || 0;
    this.executionCounts.set(flowName, count + 1);

    // Update current load
    flow.currentLoad = Math.min(flow.currentLoad + 1, flow.maxLoad);

    // Simulate execution delay
    await new Promise(resolve => setTimeout(resolve, 50));

    // Simulate potential errors
    if (flowName.includes('error') && Math.random() < 0.3) {
      throw new Error(`Simulated execution error for ${flowName}`);
    }

    // Restore load after execution
    setTimeout(() => {
      flow.currentLoad = Math.max(flow.currentLoad - 1, 0);
    }, 100);

    const result = this.mockResults.get(flowName) || `Queen Bee delegated to ${flowName}: ${description}`;
    return result;
  }

  getExecutionCount(flowName: string): number {
    return this.executionCounts.get(flowName) || 0;
  }

  resetExecutionCounts(): void {
    this.executionCounts.clear();
  }

  // Mock event emission
  on(event: string, listener: Function): this {
    // Mock event handling
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    return true;
  }
}

describe('Queen Bee Compatibility Tests', () => {
  let queenBee: QueenBee;
  let mockRegistry: MockFlowRegistry;
  let baseConfig: QueenBeeConfig;

  beforeAll(() => {
    mockRegistry = new MockFlowRegistry();
  });

  beforeEach(() => {
    baseConfig = {
      enabled: true,
      primaryFlow: 'claude-flow',
      delegationStrategy: DelegationStrategy.CAPABILITY_BASED,
      coordination: {
        maxConcurrentTasks: 10,
        taskTimeout: 30000,
        retryPolicy: {
          maxRetries: 2,
          backoffMultiplier: 2,
          initialDelay: 1000
        },
        consensus: {
          required: false,
          threshold: 0.7,
          validators: []
        }
      }
    };

    queenBee = new QueenBee(baseConfig, mockRegistry, mockLogger);
    mockRegistry.resetExecutionCounts();
  });

  afterEach(async () => {
    if (queenBee) {
      await queenBee.shutdown();
    }
    jest.clearAllMocks();
  });

  describe('Delegation Strategy Compatibility', () => {
    beforeEach(async () => {
      // Set up diverse mock flows
      mockRegistry.addMockFlow({
        name: 'claude-flow',
        type: 'claude-flow',
        status: FlowStatus.AVAILABLE,
        capabilities: ['coding', 'research', 'analysis', 'reasoning', 'coordination'],
        currentLoad: 1,
        maxLoad: 5,
        lastActivity: new Date()
      });

      mockRegistry.addMockFlow({
        name: 'gemini-flow',
        type: 'gemini-flow',
        status: FlowStatus.AVAILABLE,
        capabilities: ['multimodal', 'analysis', 'coding', 'documentation'],
        currentLoad: 0,
        maxLoad: 3,
        lastActivity: new Date()
      });

      mockRegistry.addMockFlow({
        name: 'qwen-flow',
        type: 'qwen-flow',
        status: FlowStatus.AVAILABLE,
        capabilities: ['coding', 'reasoning', 'local-inference'],
        currentLoad: 2,
        maxLoad: 4,
        lastActivity: new Date()
      });

      mockRegistry.addMockFlow({
        name: 'deepseek-flow',
        type: 'deepseek-flow',
        status: FlowStatus.AVAILABLE,
        capabilities: ['coding', 'analysis', 'optimization'],
        currentLoad: 0,
        maxLoad: 2,
        lastActivity: new Date()
      });

      mockRegistry.setMockResult('claude-flow', 'Claude Flow executed via Queen Bee');
      mockRegistry.setMockResult('gemini-flow', 'Gemini Flow executed via Queen Bee');
      mockRegistry.setMockResult('qwen-flow', 'Qwen Flow executed via Queen Bee');
      mockRegistry.setMockResult('deepseek-flow', 'DeepSeek Flow executed via Queen Bee');

      await queenBee.initialize();
    });

    it('should delegate tasks using capability-based strategy', async () => {
      const codingTask: Task = {
        id: 'capability-coding-task',
        description: 'Implement a complex algorithm with optimization',
        type: TaskType.CODE_GENERATION,
        priority: 2,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      const result = await queenBee.delegateTask(codingTask);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      const history = queenBee.getDelegationHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].confidence).toBeGreaterThan(0.5);
      expect(history[0].reason).toContain('Capability match');
    });

    it('should use load-balanced strategy effectively', async () => {
      const loadBalancedConfig = { ...baseConfig, delegationStrategy: DelegationStrategy.LOAD_BALANCED };
      const loadBalancedQueen = new QueenBee(loadBalancedConfig, mockRegistry, mockLogger);
      await loadBalancedQueen.initialize();

      const tasks = Array.from({ length: 6 }, (_, i) => ({
        id: `load-balance-task-${i}`,
        description: `Load balancing test task ${i}`,
        type: TaskType.ANALYSIS,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      }));

      // Execute tasks concurrently to test load balancing
      const results = await Promise.all(
        tasks.map(task => loadBalancedQueen.delegateTask(task))
      );

      expect(results).toHaveLength(6);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });

      // Verify load distribution across flows
      const executionCounts = [
        mockRegistry.getExecutionCount('claude-flow'),
        mockRegistry.getExecutionCount('gemini-flow'),
        mockRegistry.getExecutionCount('qwen-flow'),
        mockRegistry.getExecutionCount('deepseek-flow')
      ];

      const totalExecutions = executionCounts.reduce((sum, count) => sum + count, 0);
      expect(totalExecutions).toBe(6);
      
      // Should distribute load (no single flow should handle all tasks)
      expect(Math.max(...executionCounts)).toBeLessThan(6);

      await loadBalancedQueen.shutdown();
    });

    it('should handle priority-based delegation', async () => {
      const priorityConfig = { ...baseConfig, delegationStrategy: DelegationStrategy.PRIORITY_BASED };
      const priorityQueen = new QueenBee(priorityConfig, mockRegistry, mockLogger);
      await priorityQueen.initialize();

      const highPriorityTask: Task = {
        id: 'high-priority-task',
        description: 'Critical task requiring immediate attention',
        type: TaskType.ORCHESTRATION,
        priority: 5, // High priority
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { urgent: true }
      };

      const lowPriorityTask: Task = {
        id: 'low-priority-task',
        description: 'Routine maintenance task',
        type: TaskType.DOCUMENTATION,
        priority: 1, // Low priority
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      await priorityQueen.delegateTask(highPriorityTask);
      await priorityQueen.delegateTask(lowPriorityTask);

      const history = priorityQueen.getDelegationHistory();
      expect(history).toHaveLength(2);

      // High priority task should go to primary flow (claude-flow)
      const highPriorityDecision = history.find(d => d.taskId === 'high-priority-task');
      expect(highPriorityDecision?.targetFlow).toBe('claude-flow');

      await priorityQueen.shutdown();
    });

    it('should implement round-robin delegation', async () => {
      const roundRobinConfig = { ...baseConfig, delegationStrategy: DelegationStrategy.ROUND_ROBIN };
      const roundRobinQueen = new QueenBee(roundRobinConfig, mockRegistry, mockLogger);
      await roundRobinQueen.initialize();

      const tasks = Array.from({ length: 8 }, (_, i) => ({
        id: `round-robin-task-${i}`,
        description: `Round robin test task ${i}`,
        type: TaskType.ANALYSIS,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      }));

      for (const task of tasks) {
        await roundRobinQueen.delegateTask(task);
      }

      const history = roundRobinQueen.getDelegationHistory();
      expect(history).toHaveLength(8);

      // Should distribute across available flows in round-robin fashion
      const flowCounts = new Map<string, number>();
      history.forEach(decision => {
        const count = flowCounts.get(decision.targetFlow) || 0;
        flowCounts.set(decision.targetFlow, count + 1);
      });

      // Each available flow should get roughly equal distribution
      const counts = Array.from(flowCounts.values());
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);

      await roundRobinQueen.shutdown();
    });

    it('should use adaptive delegation strategy', async () => {
      const adaptiveConfig = { ...baseConfig, delegationStrategy: DelegationStrategy.ADAPTIVE };
      const adaptiveQueen = new QueenBee(adaptiveConfig, mockRegistry, mockLogger);
      await adaptiveQueen.initialize();

      // Mix of different task types to test adaptive behavior
      const tasks: Task[] = [
        {
          id: 'adaptive-coding-task',
          description: 'Complex coding task with multiple functions',
          type: TaskType.CODE_GENERATION,
          priority: 2,
          status: TaskStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {}
        },
        {
          id: 'adaptive-research-task',
          description: 'Research latest AI developments and analyze trends',
          type: TaskType.RESEARCH,
          priority: 1,
          status: TaskStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {}
        },
        {
          id: 'adaptive-multimodal-task',
          description: 'Analyze image content and extract information',
          type: TaskType.ANALYSIS,
          priority: 2,
          status: TaskStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {}
        }
      ];

      for (const task of tasks) {
        await adaptiveQueen.delegateTask(task);
      }

      const history = adaptiveQueen.getDelegationHistory();
      expect(history).toHaveLength(3);

      // Adaptive strategy should consider both capabilities and load
      history.forEach(decision => {
        expect(decision.confidence).toBeGreaterThan(0.6);
        expect(decision.reason).toContain('Adaptive');
      });

      await adaptiveQueen.shutdown();
    });
  });

  describe('Error Handling and Fallback Compatibility', () => {
    beforeEach(async () => {
      mockRegistry.addMockFlow({
        name: 'error-prone-flow',
        type: 'claude-flow',
        status: FlowStatus.AVAILABLE,
        capabilities: ['coding', 'analysis'],
        currentLoad: 0,
        maxLoad: 2,
        lastActivity: new Date()
      });

      mockRegistry.addMockFlow({
        name: 'reliable-fallback',
        type: 'gemini-flow',
        status: FlowStatus.AVAILABLE,
        capabilities: ['coding', 'analysis'],
        currentLoad: 0,
        maxLoad: 3,
        lastActivity: new Date()
      });

      mockRegistry.setMockResult('reliable-fallback', 'Fallback execution successful');

      const retryConfig = {
        ...baseConfig,
        primaryFlow: 'error-prone-flow',
        coordination: {
          ...baseConfig.coordination,
          retryPolicy: {
            maxRetries: 2,
            backoffMultiplier: 1.5,
            initialDelay: 100
          }
        }
      };

      queenBee = new QueenBee(retryConfig, mockRegistry, mockLogger);
      await queenBee.initialize();
    });

    it('should handle flow execution failures with retry', async () => {
      // Mock the error-prone flow to always fail
      jest.spyOn(mockRegistry, 'executeOnFlow').mockImplementation(async (flowName, description) => {
        if (flowName === 'error-prone-flow') {
          throw new Error('Simulated flow execution failure');
        }
        return `Fallback handled: ${description}`;
      });

      const task: Task = {
        id: 'retry-test-task',
        description: 'Task that should trigger retry mechanism',
        type: TaskType.CODE_GENERATION,
        priority: 2,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      const result = await queenBee.delegateTask(task);
      expect(result).toBe('Fallback handled: Task that should trigger retry mechanism');

      // Should have attempted primary flow and then used fallback
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Retrying task'));
    });

    it('should update performance metrics based on success/failure', async () => {
      const successTask: Task = {
        id: 'success-metrics-task',
        description: 'Task that should succeed',
        type: TaskType.ANALYSIS,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      await queenBee.delegateTask(successTask);

      const metrics = queenBee.getPerformanceMetrics();
      expect(metrics.size).toBeGreaterThan(0);

      // Find the flow that handled the task
      const history = queenBee.getDelegationHistory(1);
      const handlingFlow = history[0].targetFlow;
      const flowMetrics = metrics.get(handlingFlow);

      expect(flowMetrics).toBeDefined();
      expect(flowMetrics.totalTasks).toBe(1);
      expect(flowMetrics.successRate).toBeGreaterThan(0.5);
    });

    it('should handle complete system failure gracefully', async () => {
      // Mock all flows to fail
      jest.spyOn(mockRegistry, 'executeOnFlow').mockImplementation(async (flowName, description) => {
        throw new Error(`Complete system failure for ${flowName}`);
      });

      const task: Task = {
        id: 'complete-failure-task',
        description: 'Task during complete system failure',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      await expect(queenBee.delegateTask(task)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Concurrency and Load Management', () => {
    beforeEach(async () => {
      // Set up flows with limited capacity
      mockRegistry.addMockFlow({
        name: 'limited-flow-1',
        type: 'claude-flow',
        status: FlowStatus.AVAILABLE,
        capabilities: ['coding'],
        currentLoad: 0,
        maxLoad: 2,
        lastActivity: new Date()
      });

      mockRegistry.addMockFlow({
        name: 'limited-flow-2',
        type: 'gemini-flow',
        status: FlowStatus.AVAILABLE,
        capabilities: ['coding'],
        currentLoad: 0,
        maxLoad: 3,
        lastActivity: new Date()
      });

      mockRegistry.setMockResult('limited-flow-1', 'Limited Flow 1 result');
      mockRegistry.setMockResult('limited-flow-2', 'Limited Flow 2 result');

      const concurrencyConfig = {
        ...baseConfig,
        coordination: {
          ...baseConfig.coordination,
          maxConcurrentTasks: 5
        }
      };

      queenBee = new QueenBee(concurrencyConfig, mockRegistry, mockLogger);
      await queenBee.initialize();
    });

    it('should manage concurrent task delegation', async () => {
      const concurrentTasks = Array.from({ length: 8 }, (_, i) => ({
        id: `concurrent-task-${i}`,
        description: `Concurrent delegation test ${i}`,
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { batch: 'concurrent' }
      }));

      const startTime = performance.now();
      const results = await Promise.all(
        concurrentTasks.map(task => queenBee.delegateTask(task))
      );
      const endTime = performance.now();

      expect(results).toHaveLength(8);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000);

      const finalStatus = queenBee.getSystemStatus();
      expect(finalStatus.totalDelegations).toBe(8);
      expect(finalStatus.activeTasks).toBe(0); // All tasks should be complete
    });

    it('should track active tasks correctly', async () => {
      // Create long-running mock tasks
      jest.spyOn(mockRegistry, 'executeOnFlow').mockImplementation(async (flowName, description) => {
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate long execution
        return `Long running result from ${flowName}`;
      });

      const longTask: Task = {
        id: 'long-running-task',
        description: 'Task with extended execution time',
        type: TaskType.ANALYSIS,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      // Start task but don't await immediately
      const taskPromise = queenBee.delegateTask(longTask);
      
      // Check active tasks while running
      await new Promise(resolve => setTimeout(resolve, 100));
      const activeTasks = queenBee.getActiveTasks();
      expect(activeTasks).toHaveLength(1);
      expect(activeTasks[0].id).toBe('long-running-task');

      // Complete the task
      const result = await taskPromise;
      expect(result).toBeDefined();

      // Active tasks should be empty now
      const finalActiveTasks = queenBee.getActiveTasks();
      expect(finalActiveTasks).toHaveLength(0);
    });

    it('should respect coordination limits', async () => {
      const limitedConfig = {
        ...baseConfig,
        coordination: {
          ...baseConfig.coordination,
          maxConcurrentTasks: 2 // Very limited
        }
      };

      const limitedQueen = new QueenBee(limitedConfig, mockRegistry, mockLogger);
      await limitedQueen.initialize();

      // Mock long-running executions
      jest.spyOn(mockRegistry, 'executeOnFlow').mockImplementation(async (flowName, description) => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return `Result from ${flowName}`;
      });

      const tasks = Array.from({ length: 5 }, (_, i) => ({
        id: `limited-task-${i}`,
        description: `Limited concurrency test ${i}`,
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      }));

      // Start all tasks but due to coordination limits, they should queue
      const taskPromises = tasks.map(task => limitedQueen.delegateTask(task));
      
      // Check that not all are running simultaneously
      await new Promise(resolve => setTimeout(resolve, 50));
      const activeTasks = limitedQueen.getActiveTasks();
      expect(activeTasks.length).toBeLessThanOrEqual(2);

      // Wait for all to complete
      const results = await Promise.all(taskPromises);
      expect(results).toHaveLength(5);

      await limitedQueen.shutdown();
    });
  });

  describe('System Monitoring and Analytics', () => {
    beforeEach(async () => {
      mockRegistry.addMockFlow({
        name: 'analytics-flow',
        type: 'claude-flow',
        status: FlowStatus.AVAILABLE,
        capabilities: ['coding', 'analysis'],
        currentLoad: 0,
        maxLoad: 5,
        lastActivity: new Date()
      });

      mockRegistry.setMockResult('analytics-flow', 'Analytics test result');
      await queenBee.initialize();
    });

    it('should provide comprehensive system status', async () => {
      const initialStatus = queenBee.getSystemStatus();
      expect(initialStatus.activeTasks).toBe(0);
      expect(initialStatus.totalDelegations).toBe(0);
      expect(initialStatus.strategy).toBe('capability-based');
      expect(initialStatus.primaryFlow).toBe('claude-flow');

      const task: Task = {
        id: 'status-test-task',
        description: 'Task for system status testing',
        type: TaskType.ANALYSIS,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      await queenBee.delegateTask(task);

      const finalStatus = queenBee.getSystemStatus();
      expect(finalStatus.totalDelegations).toBe(1);
      expect(finalStatus.activeTasks).toBe(0);
    });

    it('should maintain delegation history with limits', async () => {
      const tasks = Array.from({ length: 15 }, (_, i) => ({
        id: `history-task-${i}`,
        description: `History test task ${i}`,
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      }));

      for (const task of tasks) {
        await queenBee.delegateTask(task);
      }

      const fullHistory = queenBee.getDelegationHistory();
      expect(fullHistory).toHaveLength(15);

      const limitedHistory = queenBee.getDelegationHistory(5);
      expect(limitedHistory).toHaveLength(5);

      // Should return most recent entries
      expect(limitedHistory[4].taskId).toBe('history-task-14');
    });

    it('should track performance metrics accurately', async () => {
      const successTask: Task = {
        id: 'success-perf-task',
        description: 'Successful performance task',
        type: TaskType.ANALYSIS,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      await queenBee.delegateTask(successTask);

      const metrics = queenBee.getPerformanceMetrics();
      expect(metrics.size).toBeGreaterThan(0);

      const flowMetrics = metrics.get('analytics-flow');
      expect(flowMetrics).toBeDefined();
      expect(flowMetrics.totalTasks).toBe(1);
      expect(flowMetrics.successRate).toBe(1.0);
      expect(flowMetrics.avgExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('Graceful Shutdown and Cleanup', () => {
    beforeEach(async () => {
      mockRegistry.addMockFlow({
        name: 'shutdown-test-flow',
        type: 'claude-flow',
        status: FlowStatus.AVAILABLE,
        capabilities: ['coding'],
        currentLoad: 0,
        maxLoad: 3,
        lastActivity: new Date()
      });

      mockRegistry.setMockResult('shutdown-test-flow', 'Shutdown test result');
      await queenBee.initialize();
    });

    it('should shutdown gracefully with active tasks', async () => {
      // Mock long-running task
      jest.spyOn(mockRegistry, 'executeOnFlow').mockImplementation(async (flowName, description) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return `Long task result from ${flowName}`;
      });

      const longTask: Task = {
        id: 'shutdown-long-task',
        description: 'Long running task during shutdown',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      // Start long-running task
      const taskPromise = queenBee.delegateTask(longTask);

      // Initiate shutdown after a short delay
      setTimeout(async () => {
        await queenBee.shutdown();
      }, 200);

      // Task should still complete even during shutdown
      const result = await taskPromise;
      expect(result).toBeDefined();

      expect(mockLogger.info).toHaveBeenCalledWith('Shutting down Queen Bee orchestrator...');
    });

    it('should handle shutdown timeout correctly', async () => {
      // Mock extremely long-running task (longer than shutdown timeout)
      jest.spyOn(mockRegistry, 'executeOnFlow').mockImplementation(async (flowName, description) => {
        await new Promise(resolve => setTimeout(resolve, 35000)); // Longer than 30s timeout
        return `Very long task result from ${flowName}`;
      });

      const veryLongTask: Task = {
        id: 'timeout-task',
        description: 'Task that exceeds shutdown timeout',
        type: TaskType.ANALYSIS,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      // Start the long task but don't await it
      const taskPromise = queenBee.delegateTask(veryLongTask).catch(() => 'Task interrupted');

      // Give task time to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Shutdown should not wait indefinitely
      const shutdownStart = performance.now();
      await queenBee.shutdown();
      const shutdownTime = performance.now() - shutdownStart;

      // Should complete shutdown in reasonable time despite long-running task
      expect(shutdownTime).toBeLessThan(32000); // Allow some buffer over 30s timeout
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('active tasks remaining'));

      // Clean up the hanging task promise
      await taskPromise;
    });

    it('should clear internal state during shutdown', async () => {
      const task: Task = {
        id: 'cleanup-task',
        description: 'Task for cleanup testing',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      await queenBee.delegateTask(task);

      const statusBefore = queenBee.getSystemStatus();
      expect(statusBefore.totalDelegations).toBe(1);

      await queenBee.shutdown();

      const activeTasks = queenBee.getActiveTasks();
      expect(activeTasks).toHaveLength(0);

      expect(mockLogger.info).toHaveBeenCalledWith('Queen Bee orchestrator shutdown complete');
    });
  });
});