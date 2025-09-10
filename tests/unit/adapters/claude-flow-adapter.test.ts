import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn } from 'child_process';
import { ClaudeFlowAdapter, ClaudeFlowConfig } from '../../../src/adapters/claude-flow-adapter.js';
import { FlowType, FlowStatus, Task, TaskType, TaskStatus } from '../../../src/types/index.js';

// Mock child_process
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Mock the Logger
jest.mock('../../../src/utils/logger.js', () => ({
  Logger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }))
}));

describe('ClaudeFlowAdapter', () => {
  let adapter: ClaudeFlowAdapter;
  let config: ClaudeFlowConfig;
  let mockProcess: any;

  beforeEach(() => {
    config = {
      enabled: true,
      priority: 1,
      maxConcurrentTasks: 2,
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
        hiveMind: true,
        swarmCoordination: true,
        mcp: true,
        webAuth: true
      },
      claudeFlowPath: '/usr/local/bin/claude-flow',
      useHiveMind: false,
      swarmConfig: {
        maxAgents: 4,
        topology: 'adaptive',
        consensus: 'majority'
      },
      mcpConfig: {
        enabled: false,
        tools: []
      }
    };

    // Mock process object
    mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn()
    };

    mockSpawn.mockReturnValue(mockProcess as any);
    
    adapter = new ClaudeFlowAdapter(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Basic Properties', () => {
    it('should have correct adapter properties', () => {
      expect(adapter.name).toBe('claude-flow');
      expect(adapter.type).toBe(FlowType.CLAUDE);
      expect(adapter.version).toBe('2.0.0-alpha.90');
    });

    it('should return correct capabilities', () => {
      const capabilities = adapter.getCapabilities();
      
      expect(capabilities.codeGeneration).toBe(true);
      expect(capabilities.codeReview).toBe(true);
      expect(capabilities.research).toBe(true);
      expect(capabilities.analysis).toBe(true);
      expect(capabilities.documentation).toBe(true);
      expect(capabilities.testing).toBe(true);
      expect(capabilities.refactoring).toBe(true);
      expect(capabilities.orchestration).toBe(true);
      expect(capabilities.hiveMind).toBe(true);
      expect(capabilities.swarmCoordination).toBe(true);
      expect(capabilities.mcp).toBe(true);
      expect(capabilities.webAuth).toBe(true);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully when claude-flow is available', async () => {
      // Mock successful version check
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });
      
      await adapter.initialize();
      
      expect(adapter.getStatus()).toBe(FlowStatus.AVAILABLE);
      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude-flow',
        ['--version'],
        { stdio: ['pipe', 'pipe', 'pipe'], shell: true }
      );
    });

    it('should fail initialization when claude-flow is not available', async () => {
      // Mock failed version check
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10);
        }
      });
      
      await expect(adapter.initialize()).rejects.toThrow('Claude Flow is not available');
      expect(adapter.getStatus()).toBe(FlowStatus.ERROR);
    });

    it('should initialize MCP when enabled', async () => {
      const mcpConfig = { ...config, mcpConfig: { enabled: true, tools: ['browser', 'filesystem'] } };
      const mcpAdapter = new ClaudeFlowAdapter(mcpConfig);
      
      // Mock successful version check
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });
      
      await mcpAdapter.initialize();
      expect(mcpAdapter.getStatus()).toBe(FlowStatus.AVAILABLE);
    });
  });

  describe('Shutdown', () => {
    beforeEach(async () => {
      // Mock successful initialization
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });
      await adapter.initialize();
    });

    it('should shutdown gracefully and terminate active processes', async () => {
      // Start a mock task to create an active process
      const task = createMockTask('test-task');
      
      // Mock task execution
      const executePromise = adapter.executeTask(task);
      
      // Shutdown while task is running
      await adapter.shutdown();
      
      expect(adapter.getStatus()).toBe(FlowStatus.OFFLINE);
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      
      // Complete the mock task execution
      setTimeout(() => {
        const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close')?.[1];
        if (closeCallback) closeCallback(0);
      }, 10);
      
      // Wait for task to complete
      await executePromise.catch(() => {}); // Ignore potential errors from shutdown
    });
  });

  describe('Task Execution', () => {
    beforeEach(async () => {
      // Mock successful initialization
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });
      await adapter.initialize();
    });

    it('should execute standard flow task successfully', async () => {
      const task = createMockTask('standard-task', TaskType.CODE_GENERATION);
      
      // Mock successful task execution
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback('Generated code output'), 10);
        }
      });
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 20);
        }
      });
      
      const result = await adapter.executeTask(task);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('Generated code output');
      expect(result.executedBy).toBe('claude-flow');
      expect(result.executionTime).toBeGreaterThan(0);
      
      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude-flow',
        ['sparc', 'run', 'coder', `"${task.description}"`],
        { stdio: ['pipe', 'pipe', 'pipe'], shell: true }
      );
    });

    it('should execute hive-mind task when enabled and complex', async () => {
      const hiveMindConfig = { ...config, useHiveMind: true };
      const hiveMindAdapter = new ClaudeFlowAdapter(hiveMindConfig);
      
      // Mock initialization
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });
      await hiveMindAdapter.initialize();
      
      // Create complex task that should use hive-mind
      const complexTask = createMockTask('complex-task', TaskType.ORCHESTRATION);
      complexTask.metadata = { complexity: 'high' };
      
      // Mock successful execution
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback('Hive-mind orchestration result'), 10);
        }
      });
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 20);
        }
      });
      
      const result = await hiveMindAdapter.executeTask(complexTask);
      
      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude-flow',
        [
          'hive-mind', 'spawn',
          `"${complexTask.description}"`,
          '--topology', 'adaptive',
          '--consensus', 'majority',
          '--max-agents', '4',
          '--auto-execute'
        ],
        { stdio: ['pipe', 'pipe', 'pipe'], shell: true }
      );
    });

    it('should handle different task types with correct SPARC modes', async () => {
      const taskModes = [
        { type: TaskType.CODE_GENERATION, mode: 'coder' },
        { type: TaskType.CODE_REVIEW, mode: 'reviewer' },
        { type: TaskType.RESEARCH, mode: 'researcher' },
        { type: TaskType.ANALYSIS, mode: 'planner' },
        { type: TaskType.DOCUMENTATION, mode: 'api-docs' },
        { type: TaskType.TESTING, mode: 'tester' },
        { type: TaskType.REFACTORING, mode: 'coder' },
        { type: TaskType.ORCHESTRATION, mode: 'system-architect' }
      ];

      for (const { type, mode } of taskModes) {
        const task = createMockTask(`task-${type}`, type);
        
        // Mock successful execution
        mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'data') {
            setTimeout(() => callback(`Result for ${type}`), 10);
          }
        });
        
        mockProcess.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 20);
          }
        });
        
        const result = await adapter.executeTask(task);
        
        expect(result.success).toBe(true);
        expect(mockSpawn).toHaveBeenCalledWith(
          '/usr/local/bin/claude-flow',
          ['sparc', 'run', mode, `"${task.description}"`],
          { stdio: ['pipe', 'pipe', 'pipe'], shell: true }
        );
        
        // Reset mocks for next iteration
        jest.clearAllMocks();
        mockSpawn.mockReturnValue(mockProcess as any);
      }
    });

    it('should handle task execution failure', async () => {
      const task = createMockTask('failing-task');
      
      // Mock failed execution
      mockProcess.stderr.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => callback('Command failed'), 10);
        }
      });
      
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 20);
        }
      });
      
      const result = await adapter.executeTask(task);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Command failed');
      expect(result.metadata?.exitCode).toBe(1);
    });

    it('should handle task execution timeout', async () => {
      const task = createMockTask('timeout-task');
      
      // Mock process that doesn't respond
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        // Don't call the close callback to simulate hanging process
      });
      
      // Use short timeout for test
      const shortTimeoutConfig = { ...config, timeout: 100 };
      const timeoutAdapter = new ClaudeFlowAdapter(shortTimeoutConfig);
      
      // Mock initialization
      const initMockProcess = { ...mockProcess };
      initMockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });
      mockSpawn.mockReturnValue(initMockProcess as any);
      await timeoutAdapter.initialize();
      
      // Reset to timeout mock for execution
      mockSpawn.mockReturnValue(mockProcess as any);
      
      await expect(timeoutAdapter.executeTask(task)).rejects.toThrow('Command timeout after 100ms');
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should reject tasks when at capacity', async () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');
      const task3 = createMockTask('task-3'); // Should be rejected
      
      // Mock hanging processes to maintain load
      mockProcess.on.mockImplementation(() => {
        // Don't call close callback
      });
      
      // Start two tasks (max capacity)
      const promise1 = adapter.executeTask(task1);
      const promise2 = adapter.executeTask(task2);
      
      // Third task should be rejected
      await expect(adapter.executeTask(task3)).rejects.toThrow('Claude Flow adapter cannot accept task');
      
      // Cleanup
      mockProcess.kill.mockImplementation(() => {
        const closeCallback = mockProcess.on.mock.calls.find(call => call[0] === 'close')?.[1];
        if (closeCallback) closeCallback(0);
      });
      
      await Promise.all([promise1.catch(() => {}), promise2.catch(() => {})]);
    });
  });

  describe('Health Check', () => {
    it('should return true when claude-flow is responsive', async () => {
      // Mock successful version check
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      });
      
      const isHealthy = await adapter.checkHealth();
      expect(isHealthy).toBe(true);
    });

    it('should return false when claude-flow is unresponsive', async () => {
      // Mock failed version check
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Command not found')), 10);
        }
      });
      
      const isHealthy = await adapter.checkHealth();
      expect(isHealthy).toBe(false);
    });
  });

  describe('Authentication', () => {
    it('should handle web authentication', async () => {
      const authConfig = {
        ...config,
        authConfig: {
          type: 'web' as const,
          webUrl: 'https://claude.ai',
          loginUrl: 'https://claude.ai/login'
        }
      };
      const authAdapter = new ClaudeFlowAdapter(authConfig);
      
      // Mock open module
      const mockOpen = jest.fn();
      jest.doMock('open', () => ({ default: mockOpen }));
      
      const result = await authAdapter.authenticate();
      expect(result).toBe(true);
    });

    it('should return authentication URL', () => {
      const authUrl = adapter.getAuthUrl();
      expect(authUrl).toBe('https://claude.ai/login');
    });

    it('should check authentication status based on API key', () => {
      // Without API key
      expect(adapter.isAuthenticated()).toBe(false);
      
      // With API key
      process.env.ANTHROPIC_API_KEY = 'test-key';
      expect(adapter.isAuthenticated()).toBe(true);
      
      // Cleanup
      delete process.env.ANTHROPIC_API_KEY;
    });
  });

  describe('Configuration Validation', () => {
    it('should validate swarm configuration', () => {
      const invalidSwarmConfig = {
        ...config,
        swarmConfig: {
          maxAgents: 0,
          topology: 'adaptive' as const,
          consensus: 'majority' as const
        }
      };
      
      expect(() => new ClaudeFlowAdapter(invalidSwarmConfig)).toThrow('swarmConfig.maxAgents must be greater than 0');
    });

    it('should validate base configuration', () => {
      const invalidConfig = { ...config, maxConcurrentTasks: 0 };
      expect(() => new ClaudeFlowAdapter(invalidConfig)).toThrow('maxConcurrentTasks must be greater than 0');
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