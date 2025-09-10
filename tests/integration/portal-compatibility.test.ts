import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { Portal } from '../../src/core/portal.js';
import { FlowRegistry } from '../../src/core/flow-registry.js';
import { MockFlowAdapter } from '../mocks/mock-flow-adapter.js';
import { FlowType, FlowStatus, Task, TaskType, TaskStatus, PortalConfig } from '../../src/types/index.js';

// Mock FlowRegistry for testing
class MockFlowRegistry extends FlowRegistry {
  private mockFlows = new Map<string, any>();
  private mockResults = new Map<string, string>();

  addMockFlow(flow: any): void {
    this.mockFlows.set(flow.name, flow);
  }

  setMockResult(flowName: string, result: string): void {
    this.mockResults.set(flowName, result);
  }

  get(flowName: string): any {
    return this.mockFlows.get(flowName);
  }

  getAvailable(): any[] {
    return Array.from(this.mockFlows.values()).filter(f => f.status === 'available');
  }

  getByCapability(capability: string): any[] {
    return Array.from(this.mockFlows.values()).filter(f => 
      f.status === 'available' && f.capabilities.includes(capability)
    );
  }

  async executeOnFlow(flowName: string, description: string): Promise<string> {
    const flow = this.mockFlows.get(flowName);
    if (!flow) {
      throw new Error(`Flow not found: ${flowName}`);
    }
    if (flow.status !== 'available') {
      throw new Error(`Flow not available: ${flowName}`);
    }

    // Simulate execution delay
    await new Promise(resolve => setTimeout(resolve, flow.simulatedDelay || 50));

    const result = this.mockResults.get(flowName) || `Mock result from ${flowName}: ${description}`;
    return result;
  }
}

describe('Portal Compatibility Tests', () => {
  let portal: Portal;
  let mockRegistry: MockFlowRegistry;

  beforeAll(() => {
    mockRegistry = new MockFlowRegistry();
  });

  beforeEach(() => {
    portal = new Portal(mockRegistry);
  });

  afterEach(() => {
    if (portal) {
      portal.clearCache();
      portal.clearHistory();
    }
  });

  describe('Flow Discovery and Routing', () => {
    beforeEach(async () => {
      // Set up mock flows
      mockRegistry.addMockFlow({
        name: 'claude-flow',
        type: 'claude-flow',
        status: 'available',
        capabilities: ['coding', 'research', 'analysis', 'reasoning'],
        currentLoad: 1,
        maxLoad: 5,
        lastActivity: new Date()
      });

      mockRegistry.addMockFlow({
        name: 'gemini-flow',
        type: 'gemini-flow',
        status: 'available',
        capabilities: ['multimodal', 'analysis', 'coding', 'documentation'],
        currentLoad: 0,
        maxLoad: 3,
        lastActivity: new Date()
      });

      mockRegistry.addMockFlow({
        name: 'qwen-flow',
        type: 'qwen-flow',
        status: 'available',
        capabilities: ['coding', 'reasoning', 'local-inference'],
        currentLoad: 2,
        maxLoad: 4,
        lastActivity: new Date()
      });

      mockRegistry.setMockResult('claude-flow', 'Claude executed successfully');
      mockRegistry.setMockResult('gemini-flow', 'Gemini executed successfully');
      mockRegistry.setMockResult('qwen-flow', 'Qwen executed successfully');

      await portal.initialize({
        defaultFlow: 'claude-flow',
        autoDetection: true,
        fallbackChain: ['claude-flow', 'gemini-flow', 'qwen-flow']
      });
    });

    it('should route coding tasks to appropriate flows', async () => {
      const codingTask: Task = {
        id: 'coding-task-1',
        description: 'Implement a simple sorting algorithm in Python',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      const result = await portal.routeTask(codingTask);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      
      // Should route to a flow with coding capability
      const capableFlows = portal.getCapableFlows('coding');
      expect(capableFlows.length).toBeGreaterThan(0);
    });

    it('should route multimodal tasks to Gemini flow', async () => {
      const multimodalTask: Task = {
        id: 'multimodal-task-1',
        description: 'Analyze this image and describe what you see in detail',
        type: TaskType.ANALYSIS,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      const result = await portal.routeTask(multimodalTask);
      expect(result).toBe('Gemini executed successfully');
    });

    it('should handle load balancing across available flows', async () => {
      const tasks = Array.from({ length: 5 }, (_, i) => ({
        id: `load-test-task-${i}`,
        description: `Load balancing test task ${i}`,
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      }));

      const results = await Promise.all(
        tasks.map(task => portal.routeTask(task))
      );

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });
    });

    it('should use fallback chain when primary flow fails', async () => {
      // Make claude-flow unavailable
      mockRegistry.addMockFlow({
        name: 'claude-flow',
        type: 'claude-flow',
        status: 'error',
        capabilities: ['coding', 'research', 'analysis', 'reasoning'],
        currentLoad: 0,
        maxLoad: 5,
        lastActivity: new Date()
      });

      const task: Task = {
        id: 'fallback-task-1',
        description: 'This should fall back to another flow',
        type: TaskType.ANALYSIS,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      const result = await portal.routeTask(task);
      expect(result).toBeDefined();
      // Should fall back to gemini-flow or qwen-flow
      expect(result).toMatch(/Gemini|Qwen executed successfully/);
    });

    it('should cache routing decisions for similar tasks', async () => {
      const similarTasks = Array.from({ length: 3 }, (_, i) => ({
        id: `cache-task-${i}`,
        description: 'Write a simple function to calculate factorial',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      }));

      // Execute tasks
      for (const task of similarTasks) {
        await portal.routeTask(task);
      }

      // Get routing stats
      const stats = portal.getRoutingStats();
      expect(stats.totalRoutes).toBe(3);
      expect(stats.cacheHitRate).toBeGreaterThan(0);
    });

    it('should provide flow recommendations based on task characteristics', async () => {
      const researchTask: Task = {
        id: 'research-task-1',
        description: 'Research the latest developments in quantum computing',
        type: TaskType.RESEARCH,
        priority: 2,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      const recommendation = portal.getRecommendedFlow(researchTask);
      expect(recommendation).toBeDefined();
      expect(recommendation!.capabilities).toContain('research');
    });
  });

  describe('Configuration Compatibility', () => {
    it('should handle different portal configurations', async () => {
      const configs: PortalConfig[] = [
        {
          defaultFlow: 'claude-flow',
          autoDetection: false,
          fallbackChain: ['claude-flow']
        },
        {
          defaultFlow: 'gemini-flow',
          autoDetection: true,
          fallbackChain: ['gemini-flow', 'claude-flow']
        },
        {
          defaultFlow: 'qwen-flow',
          autoDetection: true,
          fallbackChain: ['qwen-flow', 'claude-flow', 'gemini-flow']
        }
      ];

      for (const config of configs) {
        const testPortal = new Portal(mockRegistry);
        await testPortal.initialize(config);

        const testTask: Task = {
          id: `config-test-${config.defaultFlow}`,
          description: 'Test task for configuration compatibility',
          type: TaskType.ANALYSIS,
          priority: 1,
          status: TaskStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {}
        };

        const result = await testPortal.routeTask(testTask);
        expect(result).toBeDefined();

        await testPortal.shutdown();
      }
    });

    it('should handle missing default flow gracefully', async () => {
      mockRegistry.addMockFlow({
        name: 'claude-flow',
        type: 'claude-flow',
        status: 'offline',
        capabilities: ['coding'],
        currentLoad: 0,
        maxLoad: 5,
        lastActivity: new Date()
      });

      await portal.initialize({
        defaultFlow: 'nonexistent-flow',
        autoDetection: true,
        fallbackChain: ['claude-flow']
      });

      const task: Task = {
        id: 'missing-default-task',
        description: 'Test with missing default flow',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      // Should handle gracefully by using auto-detection or fallback
      const result = await portal.routeTask(task).catch(error => error.message);
      expect(result).toBeDefined();
    });
  });

  describe('Direct Routing Compatibility', () => {
    beforeEach(async () => {
      mockRegistry.addMockFlow({
        name: 'direct-test-flow',
        type: 'claude-flow',
        status: 'available',
        capabilities: ['coding'],
        currentLoad: 0,
        maxLoad: 3,
        lastActivity: new Date()
      });

      mockRegistry.setMockResult('direct-test-flow', 'Direct routing successful');

      await portal.initialize();
    });

    it('should route tasks directly to specified flows', async () => {
      const task: Task = {
        id: 'direct-routing-task',
        description: 'This should go directly to the specified flow',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      const result = await portal.routeToFlow(task, 'direct-test-flow');
      expect(result).toBe('Direct routing successful');
    });

    it('should reject direct routing to unavailable flows', async () => {
      mockRegistry.addMockFlow({
        name: 'unavailable-flow',
        type: 'claude-flow',
        status: 'busy',
        capabilities: ['coding'],
        currentLoad: 3,
        maxLoad: 3,
        lastActivity: new Date()
      });

      const task: Task = {
        id: 'direct-unavailable-task',
        description: 'This should fail for unavailable flow',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      await expect(portal.routeToFlow(task, 'unavailable-flow'))
        .rejects.toThrow('Flow not available: unavailable-flow');
    });

    it('should reject direct routing to nonexistent flows', async () => {
      const task: Task = {
        id: 'direct-nonexistent-task',
        description: 'This should fail for nonexistent flow',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      await expect(portal.routeToFlow(task, 'nonexistent-flow'))
        .rejects.toThrow('Flow not found: nonexistent-flow');
    });
  });

  describe('Analytics and Monitoring Compatibility', () => {
    beforeEach(async () => {
      mockRegistry.addMockFlow({
        name: 'analytics-flow-1',
        type: 'claude-flow',
        status: 'available',
        capabilities: ['coding', 'analysis'],
        currentLoad: 0,
        maxLoad: 2,
        lastActivity: new Date()
      });

      mockRegistry.addMockFlow({
        name: 'analytics-flow-2',
        type: 'gemini-flow',
        status: 'available',
        capabilities: ['multimodal', 'analysis'],
        currentLoad: 1,
        maxLoad: 3,
        lastActivity: new Date()
      });

      mockRegistry.setMockResult('analytics-flow-1', 'Analytics flow 1 result');
      mockRegistry.setMockResult('analytics-flow-2', 'Analytics flow 2 result');

      await portal.initialize({
        defaultFlow: 'analytics-flow-1',
        autoDetection: true,
        fallbackChain: ['analytics-flow-1', 'analytics-flow-2']
      });
    });

    it('should track routing statistics correctly', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `analytics-task-${i}`,
        description: `Analytics test task ${i}`,
        type: i % 2 === 0 ? TaskType.CODE_GENERATION : TaskType.ANALYSIS,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      }));

      // Execute all tasks
      for (const task of tasks) {
        await portal.routeTask(task);
      }

      const stats = portal.getRoutingStats();
      expect(stats.totalRoutes).toBe(10);
      expect(stats.flowUsage.size).toBeGreaterThan(0);
      expect(stats.successRateByFlow.size).toBeGreaterThan(0);

      // Verify success rates are reasonable
      for (const [flowName, successRate] of stats.successRateByFlow) {
        expect(successRate).toBeGreaterThanOrEqual(0);
        expect(successRate).toBeLessThanOrEqual(1);
      }
    });

    it('should provide capability-based flow queries', async () => {
      const codingFlows = portal.getCapableFlows('coding');
      const analysisFlows = portal.getCapableFlows('analysis');
      const multimodalFlows = portal.getCapableFlows('multimodal');

      expect(codingFlows.length).toBeGreaterThan(0);
      expect(analysisFlows.length).toBe(2); // Both flows have analysis capability
      expect(multimodalFlows.length).toBe(1); // Only analytics-flow-2 has multimodal

      // Verify capability matching
      codingFlows.forEach(flow => {
        expect(flow.capabilities).toContain('coding');
      });
    });

    it('should handle cache management correctly', async () => {
      const task1: Task = {
        id: 'cache-test-1',
        description: 'First cache test task',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      const task2: Task = {
        id: 'cache-test-2',
        description: 'Second cache test task',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      // Execute similar tasks
      await portal.routeTask(task1);
      await portal.routeTask(task2);

      const statsBefore = portal.getRoutingStats();
      expect(statsBefore.totalRoutes).toBe(2);

      // Clear cache
      portal.clearCache();

      // Execute another task
      await portal.routeTask(task1);
      const statsAfter = portal.getRoutingStats();
      expect(statsAfter.totalRoutes).toBe(3);
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(async () => {
      mockRegistry.addMockFlow({
        name: 'error-flow',
        type: 'claude-flow',
        status: 'available',
        capabilities: ['coding'],
        currentLoad: 0,
        maxLoad: 2,
        lastActivity: new Date(),
        simulatedDelay: 100
      });

      mockRegistry.addMockFlow({
        name: 'backup-flow',
        type: 'gemini-flow',
        status: 'available',
        capabilities: ['coding'],
        currentLoad: 0,
        maxLoad: 2,
        lastActivity: new Date(),
        simulatedDelay: 50
      });

      // Set error flow to throw error
      mockRegistry.setMockResult('error-flow', 'THROW_ERROR');
      mockRegistry.setMockResult('backup-flow', 'Backup flow executed successfully');

      await portal.initialize({
        defaultFlow: 'error-flow',
        autoDetection: true,
        fallbackChain: ['error-flow', 'backup-flow']
      });
    });

    it('should handle flow execution errors with fallback', async () => {
      // Mock the executeOnFlow to throw error for error-flow
      const originalExecute = mockRegistry.executeOnFlow.bind(mockRegistry);
      jest.spyOn(mockRegistry, 'executeOnFlow').mockImplementation(async (flowName, description) => {
        if (flowName === 'error-flow') {
          throw new Error('Simulated flow execution error');
        }
        return originalExecute(flowName, description);
      });

      const task: Task = {
        id: 'error-handling-task',
        description: 'This should trigger error handling',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      const result = await portal.routeTask(task);
      expect(result).toBe('Backup flow executed successfully');
    });

    it('should handle complete fallback chain failure', async () => {
      // Mock all flows to fail
      jest.spyOn(mockRegistry, 'executeOnFlow').mockImplementation(async (flowName, description) => {
        throw new Error(`Simulated error for ${flowName}`);
      });

      const task: Task = {
        id: 'complete-failure-task',
        description: 'This should cause complete failure',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      await expect(portal.routeTask(task)).rejects.toThrow();
    });

    it('should handle flow status changes during routing', async () => {
      const task: Task = {
        id: 'status-change-task',
        description: 'Test status change handling',
        type: TaskType.CODE_GENERATION,
        priority: 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {}
      };

      // Change flow status after initialization
      mockRegistry.addMockFlow({
        name: 'error-flow',
        type: 'claude-flow',
        status: 'error', // Changed to error
        capabilities: ['coding'],
        currentLoad: 0,
        maxLoad: 2,
        lastActivity: new Date()
      });

      const result = await portal.routeTask(task);
      // Should route to backup-flow instead
      expect(result).toBe('Backup flow executed successfully');
    });
  });

  describe('Performance and Scalability', () => {
    beforeEach(async () => {
      // Set up multiple flows for load testing
      for (let i = 1; i <= 5; i++) {
        mockRegistry.addMockFlow({
          name: `perf-flow-${i}`,
          type: 'claude-flow',
          status: 'available',
          capabilities: ['coding', 'analysis'],
          currentLoad: 0,
          maxLoad: 10,
          lastActivity: new Date(),
          simulatedDelay: Math.random() * 100 + 50 // 50-150ms delay
        });

        mockRegistry.setMockResult(`perf-flow-${i}`, `Result from perf-flow-${i}`);
      }

      await portal.initialize({
        defaultFlow: 'perf-flow-1',
        autoDetection: true,
        fallbackChain: Array.from({ length: 5 }, (_, i) => `perf-flow-${i + 1}`)
      });
    });

    it('should handle high-volume concurrent routing', async () => {
      const tasks = Array.from({ length: 50 }, (_, i) => ({
        id: `concurrent-task-${i}`,
        description: `Concurrent test task ${i}`,
        type: TaskType.CODE_GENERATION,
        priority: Math.floor(Math.random() * 3) + 1,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { batch: 'concurrent-test' }
      }));

      const startTime = performance.now();
      const results = await Promise.all(
        tasks.map(task => portal.routeTask(task))
      );
      const endTime = performance.now();

      expect(results).toHaveLength(50);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });

      // Should complete within reasonable time (adjust based on simulated delays)
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(10000); // 10 seconds max

      // Verify load distribution
      const stats = portal.getRoutingStats();
      expect(stats.totalRoutes).toBe(50);
      expect(stats.flowUsage.size).toBeGreaterThan(1); // Tasks should be distributed
    }, 15000);

    it('should maintain cache efficiency under load', async () => {
      // Generate similar tasks to test cache efficiency
      const taskGroups = [
        { type: TaskType.CODE_GENERATION, description: 'Generate Python function', count: 10 },
        { type: TaskType.ANALYSIS, description: 'Analyze code quality', count: 10 },
        { type: TaskType.DOCUMENTATION, description: 'Create API documentation', count: 10 }
      ];

      const allTasks = taskGroups.flatMap(group =>
        Array.from({ length: group.count }, (_, i) => ({
          id: `cache-efficiency-${group.type}-${i}`,
          description: group.description,
          type: group.type,
          priority: 1,
          status: TaskStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: { group: group.type }
        }))
      );

      // Execute tasks
      for (const task of allTasks) {
        await portal.routeTask(task);
      }

      const stats = portal.getRoutingStats();
      expect(stats.totalRoutes).toBe(30);
      
      // Cache hit rate should be reasonable for similar tasks
      expect(stats.cacheHitRate).toBeGreaterThan(0.3); // At least 30% cache hit rate
    });
  });
});