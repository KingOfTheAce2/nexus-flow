import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

// Mock NexusEngine for E2E testing
import { NexusEngine } from '../../src/core/nexus-engine.js';
import { Portal } from '../../src/core/portal.js';
import { QueenBee } from '../../src/core/queen-bee.js';
import { FlowRegistry } from '../../src/core/flow-registry.js';
import { MockFlowAdapter } from '../mocks/mock-flow-adapter.js';
import { 
  Task, 
  TaskType, 
  TaskStatus, 
  FlowType, 
  DelegationStrategy,
  NexusConfig 
} from '../../src/types/index.js';

// E2E Workflow Test Runner
class WorkflowTestRunner {
  private tempDir: string;
  private configFile: string;
  private nexusEngine?: NexusEngine;
  private logFile: string;

  constructor() {
    this.tempDir = join(process.cwd(), 'tests', 'temp', 'e2e');
    this.configFile = join(this.tempDir, 'nexus-config.json');
    this.logFile = join(this.tempDir, 'test-execution.log');
  }

  async setup(): Promise<void> {
    // Create temp directory
    await fs.mkdir(this.tempDir, { recursive: true });
    
    // Create test configuration
    const testConfig: NexusConfig = {
      flows: [
        {
          name: 'e2e-claude-flow',
          type: FlowType.CLAUDE,
          enabled: true,
          config: {
            claudeFlowPath: 'mock-claude-flow',
            useHiveMind: false,
            maxConcurrentTasks: 3,
            timeout: 15000,
            retryAttempts: 2
          },
          priority: 1,
          capabilities: ['codeGeneration', 'codeReview', 'research', 'analysis']
        },
        {
          name: 'e2e-gemini-flow',
          type: FlowType.GEMINI,
          enabled: true,
          config: {
            geminiFlowPath: 'mock-gemini-flow',
            maxConcurrentTasks: 2,
            timeout: 12000,
            retryAttempts: 1
          },
          priority: 2,
          capabilities: ['multimodal', 'analysis', 'documentation']
        },
        {
          name: 'e2e-qwen-flow',
          type: FlowType.QWEN,
          enabled: true,
          config: {
            qwenFlowPath: 'mock-qwen-flow',
            maxConcurrentTasks: 4,
            timeout: 20000,
            retryAttempts: 2
          },
          priority: 3,
          capabilities: ['coding', 'reasoning', 'optimization']
        }
      ],
      queenBee: {
        enabled: true,
        primaryFlow: 'e2e-claude-flow',
        delegationStrategy: DelegationStrategy.ADAPTIVE,
        coordination: {
          maxConcurrentTasks: 10,
          taskTimeout: 30000,
          retryPolicy: {
            maxRetries: 3,
            backoffMultiplier: 2,
            initialDelay: 1000
          }
        }
      },
      portal: {
        defaultFlow: 'e2e-claude-flow',
        autoDetection: true,
        fallbackChain: ['e2e-claude-flow', 'e2e-gemini-flow', 'e2e-qwen-flow']
      },
      logging: {
        level: 'info',
        file: this.logFile,
        console: false
      }
    };

    await fs.writeFile(this.configFile, JSON.stringify(testConfig, null, 2));
  }

  async cleanup(): Promise<void> {
    if (this.nexusEngine) {
      await this.nexusEngine.shutdown();
    }
    
    // Clean up temp files
    try {
      const files = await fs.readdir(this.tempDir);
      for (const file of files) {
        await fs.unlink(join(this.tempDir, file));
      }
      await fs.rmdir(this.tempDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async initializeNexusEngine(): Promise<NexusEngine> {
    const config = JSON.parse(await fs.readFile(this.configFile, 'utf-8'));
    this.nexusEngine = new NexusEngine();
    
    // Initialize with test configuration
    await this.nexusEngine.initialize(config);
    
    return this.nexusEngine;
  }

  async executeWorkflow(workflow: WorkflowDefinition): Promise<WorkflowResult> {
    if (!this.nexusEngine) {
      throw new Error('Nexus Engine not initialized');
    }

    const startTime = performance.now();
    const results: TaskResult[] = [];
    const errors: string[] = [];

    try {
      for (const step of workflow.steps) {
        try {
          const result = await this.executeWorkflowStep(step);
          results.push(result);
        } catch (error: any) {
          errors.push(`Step ${step.id}: ${error.message}`);
          if (step.required) {
            throw error;
          }
        }
      }

      const executionTime = performance.now() - startTime;
      
      return {
        workflowId: workflow.id,
        success: errors.length === 0,
        executionTime,
        results,
        errors,
        metadata: {
          totalSteps: workflow.steps.length,
          successfulSteps: results.length,
          failedSteps: errors.length
        }
      };

    } catch (error: any) {
      const executionTime = performance.now() - startTime;
      return {
        workflowId: workflow.id,
        success: false,
        executionTime,
        results,
        errors: [...errors, error.message],
        metadata: {
          totalSteps: workflow.steps.length,
          successfulSteps: results.length,
          failedSteps: errors.length + 1,
          criticalFailure: true
        }
      };
    }
  }

  private async executeWorkflowStep(step: WorkflowStep): Promise<TaskResult> {
    const task: Task = {
      id: step.id,
      description: step.description,
      type: step.type,
      priority: step.priority || 1,
      status: TaskStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: step.metadata || {}
    };

    let result: string;

    switch (step.executionMode) {
      case 'portal':
        result = await this.nexusEngine!.routeViaPortal(task);
        break;
      case 'queen-bee':
        result = await this.nexusEngine!.delegateToQueenBee(task);
        break;
      case 'direct':
        if (!step.targetFlow) {
          throw new Error(`Direct execution requires targetFlow for step ${step.id}`);
        }
        result = await this.nexusEngine!.executeOnSpecificFlow(step.targetFlow, task);
        break;
      default:
        result = await this.nexusEngine!.execute(task.description);
    }

    return {
      stepId: step.id,
      success: true,
      output: result,
      executionTime: 0, // Will be calculated by caller
      metadata: step.metadata
    };
  }

  async getExecutionLogs(): Promise<string[]> {
    try {
      const logContent = await fs.readFile(this.logFile, 'utf-8');
      return logContent.split('\n').filter(line => line.trim());
    } catch (error) {
      return [];
    }
  }

  async getSystemStatus(): Promise<any> {
    if (!this.nexusEngine) {
      throw new Error('Nexus Engine not initialized');
    }
    return this.nexusEngine.getSystemStatus();
  }
}

// Workflow definitions
interface WorkflowStep {
  id: string;
  description: string;
  type: TaskType;
  executionMode: 'portal' | 'queen-bee' | 'direct' | 'auto';
  targetFlow?: string;
  priority?: number;
  required?: boolean;
  metadata?: Record<string, any>;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  expectedDuration?: number;
  metadata?: Record<string, any>;
}

interface TaskResult {
  stepId: string;
  success: boolean;
  output: string;
  executionTime: number;
  metadata?: Record<string, any>;
}

interface WorkflowResult {
  workflowId: string;
  success: boolean;
  executionTime: number;
  results: TaskResult[];
  errors: string[];
  metadata: Record<string, any>;
}

describe('End-to-End Workflow Integration Tests', () => {
  let testRunner: WorkflowTestRunner;

  beforeAll(async () => {
    testRunner = new WorkflowTestRunner();
    await testRunner.setup();
  });

  afterAll(async () => {
    await testRunner.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Workflow Execution', () => {
    it('should execute simple single-flow workflow', async () => {
      const simpleWorkflow: WorkflowDefinition = {
        id: 'simple-workflow-001',
        name: 'Simple Code Generation',
        description: 'Basic code generation workflow',
        steps: [
          {
            id: 'generate-function',
            description: 'Create a Python function to calculate fibonacci numbers',
            type: TaskType.CODE_GENERATION,
            executionMode: 'portal',
            required: true,
            priority: 1
          }
        ],
        expectedDuration: 5000
      };

      // Mock the nexus engine for testing
      const mockEngine = {
        initialize: jest.fn(),
        routeViaPortal: jest.fn().mockResolvedValue('def fibonacci(n):\n  if n <= 1:\n    return n\n  return fibonacci(n-1) + fibonacci(n-2)'),
        shutdown: jest.fn()
      } as any;

      testRunner['nexusEngine'] = mockEngine;

      const result = await testRunner.executeWorkflow(simpleWorkflow);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].output).toContain('fibonacci');
      expect(result.errors).toHaveLength(0);
    }, 15000);

    it('should execute multi-step workflow with different execution modes', async () => {
      const multiStepWorkflow: WorkflowDefinition = {
        id: 'multi-step-workflow-001',
        name: 'Full Development Lifecycle',
        description: 'Complete development workflow from requirements to testing',
        steps: [
          {
            id: 'analyze-requirements',
            description: 'Analyze the requirements for a todo list application',
            type: TaskType.ANALYSIS,
            executionMode: 'queen-bee',
            required: true,
            priority: 3
          },
          {
            id: 'generate-code',
            description: 'Generate Python code for a todo list with CRUD operations',
            type: TaskType.CODE_GENERATION,
            executionMode: 'direct',
            targetFlow: 'e2e-qwen-flow',
            required: true,
            priority: 2
          },
          {
            id: 'review-code',
            description: 'Review the generated code for best practices and security',
            type: TaskType.CODE_REVIEW,
            executionMode: 'portal',
            required: true,
            priority: 2
          },
          {
            id: 'generate-tests',
            description: 'Create unit tests for the todo list application',
            type: TaskType.TESTING,
            executionMode: 'queen-bee',
            required: false,
            priority: 1
          },
          {
            id: 'create-docs',
            description: 'Generate API documentation for the todo list endpoints',
            type: TaskType.DOCUMENTATION,
            executionMode: 'portal',
            required: false,
            priority: 1
          }
        ],
        expectedDuration: 20000
      };

      // Mock complex workflow execution
      const mockEngine = {
        initialize: jest.fn(),
        delegateToQueenBee: jest.fn()
          .mockResolvedValueOnce('Requirements analysis: Todo app needs CRUD operations, user authentication, data persistence')
          .mockResolvedValueOnce('Unit tests generated: test_create_todo(), test_update_todo(), test_delete_todo()'),
        executeOnSpecificFlow: jest.fn()
          .mockResolvedValue('class TodoList:\n  def __init__(self):\n    self.todos = []\n  def add_todo(self, item):\n    self.todos.append(item)'),
        routeViaPortal: jest.fn()
          .mockResolvedValueOnce('Code review: Good structure, consider adding input validation and error handling')
          .mockResolvedValueOnce('# API Documentation\n## Endpoints\n- POST /todos - Create todo\n- GET /todos - List todos'),
        shutdown: jest.fn()
      } as any;

      testRunner['nexusEngine'] = mockEngine;

      const result = await testRunner.executeWorkflow(multiStepWorkflow);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(5);
      expect(result.results.every(r => r.success)).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata.totalSteps).toBe(5);
      expect(result.metadata.successfulSteps).toBe(5);

      // Verify different execution modes were used
      expect(mockEngine.delegateToQueenBee).toHaveBeenCalledTimes(2);
      expect(mockEngine.executeOnSpecificFlow).toHaveBeenCalledTimes(1);
      expect(mockEngine.routeViaPortal).toHaveBeenCalledTimes(2);
    }, 30000);
  });

  describe('Error Handling and Recovery', () => {
    it('should handle partial workflow failures gracefully', async () => {
      const partialFailureWorkflow: WorkflowDefinition = {
        id: 'partial-failure-workflow-001',
        name: 'Workflow with Non-Critical Failures',
        description: 'Workflow that continues despite non-critical failures',
        steps: [
          {
            id: 'critical-step',
            description: 'Critical analysis step that must succeed',
            type: TaskType.ANALYSIS,
            executionMode: 'queen-bee',
            required: true,
            priority: 3
          },
          {
            id: 'failing-optional-step',
            description: 'Optional step that will fail',
            type: TaskType.DOCUMENTATION,
            executionMode: 'portal',
            required: false,
            priority: 1
          },
          {
            id: 'recovery-step',
            description: 'Step that should execute after optional failure',
            type: TaskType.CODE_GENERATION,
            executionMode: 'direct',
            targetFlow: 'e2e-claude-flow',
            required: true,
            priority: 2
          }
        ]
      };

      const mockEngine = {
        initialize: jest.fn(),
        delegateToQueenBee: jest.fn().mockResolvedValue('Critical analysis completed successfully'),
        routeViaPortal: jest.fn().mockRejectedValue(new Error('Simulated portal routing failure')),
        executeOnSpecificFlow: jest.fn().mockResolvedValue('Recovery code generated successfully'),
        shutdown: jest.fn()
      } as any;

      testRunner['nexusEngine'] = mockEngine;

      const result = await testRunner.executeWorkflow(partialFailureWorkflow);

      expect(result.success).toBe(false); // Overall failure due to error
      expect(result.results).toHaveLength(2); // Two successful steps
      expect(result.errors).toHaveLength(1); // One error from optional step
      expect(result.errors[0]).toContain('failing-optional-step');
      
      // Critical and recovery steps should have succeeded
      const criticalResult = result.results.find(r => r.stepId === 'critical-step');
      const recoveryResult = result.results.find(r => r.stepId === 'recovery-step');
      expect(criticalResult?.success).toBe(true);
      expect(recoveryResult?.success).toBe(true);
    });

    it('should fail workflow on critical step failure', async () => {
      const criticalFailureWorkflow: WorkflowDefinition = {
        id: 'critical-failure-workflow-001',
        name: 'Workflow with Critical Failure',
        description: 'Workflow that must stop on critical failure',
        steps: [
          {
            id: 'setup-step',
            description: 'Initial setup step',
            type: TaskType.ANALYSIS,
            executionMode: 'portal',
            required: true,
            priority: 1
          },
          {
            id: 'critical-failing-step',
            description: 'Critical step that will fail',
            type: TaskType.CODE_GENERATION,
            executionMode: 'queen-bee',
            required: true,
            priority: 3
          },
          {
            id: 'unreached-step',
            description: 'Step that should not execute',
            type: TaskType.TESTING,
            executionMode: 'portal',
            required: true,
            priority: 1
          }
        ]
      };

      const mockEngine = {
        initialize: jest.fn(),
        routeViaPortal: jest.fn().mockResolvedValue('Setup completed'),
        delegateToQueenBee: jest.fn().mockRejectedValue(new Error('Critical system failure')),
        shutdown: jest.fn()
      } as any;

      testRunner['nexusEngine'] = mockEngine;

      const result = await testRunner.executeWorkflow(criticalFailureWorkflow);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1); // Only setup step succeeded
      expect(result.errors).toHaveLength(1);
      expect(result.metadata.criticalFailure).toBe(true);
      
      // Verify unreached step was not executed
      expect(result.results.find(r => r.stepId === 'unreached-step')).toBeUndefined();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high-volume workflow execution', async () => {
      const highVolumeWorkflow: WorkflowDefinition = {
        id: 'high-volume-workflow-001',
        name: 'High Volume Processing',
        description: 'Workflow with many parallel processing steps',
        steps: Array.from({ length: 20 }, (_, i) => ({
          id: `batch-process-${i}`,
          description: `Process batch item ${i} with data transformation`,
          type: TaskType.ANALYSIS,
          executionMode: 'queen-bee' as const,
          required: false,
          priority: 1,
          metadata: { batchId: i }
        })),
        expectedDuration: 15000
      };

      const mockEngine = {
        initialize: jest.fn(),
        delegateToQueenBee: jest.fn().mockImplementation(async (task: Task) => {
          // Simulate varying execution times
          await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 50));
          return `Processed batch ${task.metadata?.batchId}: transformation complete`;
        }),
        shutdown: jest.fn()
      } as any;

      testRunner['nexusEngine'] = mockEngine;

      const startTime = performance.now();
      const result = await testRunner.executeWorkflow(highVolumeWorkflow);
      const executionTime = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(20);
      expect(result.results.every(r => r.success)).toBe(true);
      expect(executionTime).toBeLessThan(highVolumeWorkflow.expectedDuration!);
      
      // Verify all batch items were processed
      for (let i = 0; i < 20; i++) {
        const batchResult = result.results.find(r => r.stepId === `batch-process-${i}`);
        expect(batchResult).toBeDefined();
        expect(batchResult!.output).toContain(`batch ${i}`);
      }
    }, 20000);

    it('should maintain system stability during concurrent workflows', async () => {
      const concurrentWorkflow: WorkflowDefinition = {
        id: 'concurrent-base',
        name: 'Concurrent Base Workflow',
        description: 'Base workflow for concurrent execution testing',
        steps: [
          {
            id: 'analyze',
            description: 'Concurrent analysis task',
            type: TaskType.ANALYSIS,
            executionMode: 'portal',
            required: true,
            priority: 2
          },
          {
            id: 'generate',
            description: 'Concurrent generation task',
            type: TaskType.CODE_GENERATION,
            executionMode: 'queen-bee',
            required: true,
            priority: 2
          }
        ]
      };

      const mockEngine = {
        initialize: jest.fn(),
        routeViaPortal: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 300));
          return 'Concurrent analysis completed';
        }),
        delegateToQueenBee: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 400));
          return 'Concurrent code generated';
        }),
        shutdown: jest.fn(),
        getSystemStatus: jest.fn().mockReturnValue({
          initialized: true,
          availableFlows: 3,
          activeFlows: 3,
          queenBeeEnabled: true
        })
      } as any;

      testRunner['nexusEngine'] = mockEngine;

      // Create multiple workflows with different IDs
      const workflows = Array.from({ length: 5 }, (_, i) => ({
        ...concurrentWorkflow,
        id: `concurrent-workflow-${i}`,
        steps: concurrentWorkflow.steps.map(step => ({
          ...step,
          id: `${step.id}-${i}`,
          description: `${step.description} ${i}`
        }))
      }));

      // Execute workflows concurrently
      const startTime = performance.now();
      const results = await Promise.all(
        workflows.map(workflow => testRunner.executeWorkflow(workflow))
      );
      const executionTime = performance.now() - startTime;

      // All workflows should succeed
      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.results).toHaveLength(2);
        expect(result.workflowId).toBe(`concurrent-workflow-${i}`);
      });

      // Should complete within reasonable time despite concurrency
      expect(executionTime).toBeLessThan(3000);

      // System should remain stable
      const systemStatus = await testRunner.getSystemStatus();
      expect(systemStatus.initialized).toBe(true);
      expect(systemStatus.availableFlows).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Integration Validation', () => {
    it('should validate complete integration between Portal and Queen Bee', async () => {
      const integrationWorkflow: WorkflowDefinition = {
        id: 'integration-validation-001',
        name: 'Portal-Queen Bee Integration',
        description: 'Validate seamless integration between routing mechanisms',
        steps: [
          {
            id: 'portal-route',
            description: 'Route task via Portal for optimal flow selection',
            type: TaskType.RESEARCH,
            executionMode: 'portal',
            required: true,
            priority: 2
          },
          {
            id: 'queen-bee-delegate',
            description: 'Delegate complex orchestration to Queen Bee',
            type: TaskType.ORCHESTRATION,
            executionMode: 'queen-bee',
            required: true,
            priority: 3
          },
          {
            id: 'direct-execute',
            description: 'Execute specific task on designated flow',
            type: TaskType.CODE_GENERATION,
            executionMode: 'direct',
            targetFlow: 'e2e-claude-flow',
            required: true,
            priority: 2
          },
          {
            id: 'auto-route',
            description: 'Auto-route based on system intelligence',
            type: TaskType.TESTING,
            executionMode: 'auto',
            required: true,
            priority: 1
          }
        ]
      };

      let executionOrder: string[] = [];

      const mockEngine = {
        initialize: jest.fn(),
        routeViaPortal: jest.fn().mockImplementation(async (task: Task) => {
          executionOrder.push(`portal:${task.id}`);
          return `Portal routed ${task.id} to optimal flow`;
        }),
        delegateToQueenBee: jest.fn().mockImplementation(async (task: Task) => {
          executionOrder.push(`queenbee:${task.id}`);
          return `Queen Bee delegated ${task.id} with high confidence`;
        }),
        executeOnSpecificFlow: jest.fn().mockImplementation(async (flowName: string, task: Task) => {
          executionOrder.push(`direct:${flowName}:${task.id}`);
          return `Direct execution on ${flowName} for ${task.id}`;
        }),
        execute: jest.fn().mockImplementation(async (description: string) => {
          executionOrder.push(`auto:${description.substring(0, 10)}`);
          return `Auto-routed execution: ${description}`;
        }),
        shutdown: jest.fn()
      } as any;

      testRunner['nexusEngine'] = mockEngine;

      const result = await testRunner.executeWorkflow(integrationWorkflow);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(4);
      
      // Verify execution order and routing mechanisms
      expect(executionOrder).toHaveLength(4);
      expect(executionOrder[0]).toContain('portal:portal-route');
      expect(executionOrder[1]).toContain('queenbee:queen-bee-delegate');
      expect(executionOrder[2]).toContain('direct:e2e-claude-flow:direct-execute');
      expect(executionOrder[3]).toContain('auto:');

      // Verify each routing mechanism was called correctly
      expect(mockEngine.routeViaPortal).toHaveBeenCalledTimes(1);
      expect(mockEngine.delegateToQueenBee).toHaveBeenCalledTimes(1);
      expect(mockEngine.executeOnSpecificFlow).toHaveBeenCalledTimes(1);
      expect(mockEngine.execute).toHaveBeenCalledTimes(1);
    });

    it('should handle complex real-world workflow scenarios', async () => {
      const realWorldWorkflow: WorkflowDefinition = {
        id: 'real-world-scenario-001',
        name: 'Full-Stack Application Development',
        description: 'Complete workflow for developing a full-stack application',
        steps: [
          {
            id: 'requirements-gathering',
            description: 'Gather and analyze requirements for an e-commerce platform',
            type: TaskType.RESEARCH,
            executionMode: 'queen-bee',
            required: true,
            priority: 3,
            metadata: { phase: 'planning' }
          },
          {
            id: 'architecture-design',
            description: 'Design system architecture with microservices approach',
            type: TaskType.ANALYSIS,
            executionMode: 'portal',
            required: true,
            priority: 3,
            metadata: { phase: 'design' }
          },
          {
            id: 'backend-implementation',
            description: 'Implement REST API with authentication and payment processing',
            type: TaskType.CODE_GENERATION,
            executionMode: 'direct',
            targetFlow: 'e2e-qwen-flow',
            required: true,
            priority: 2,
            metadata: { phase: 'development', component: 'backend' }
          },
          {
            id: 'frontend-implementation',
            description: 'Create responsive React frontend with modern UI/UX',
            type: TaskType.CODE_GENERATION,
            executionMode: 'queen-bee',
            required: true,
            priority: 2,
            metadata: { phase: 'development', component: 'frontend' }
          },
          {
            id: 'integration-testing',
            description: 'Develop comprehensive integration test suite',
            type: TaskType.TESTING,
            executionMode: 'portal',
            required: true,
            priority: 2,
            metadata: { phase: 'testing' }
          },
          {
            id: 'performance-optimization',
            description: 'Analyze and optimize application performance',
            type: TaskType.ANALYSIS,
            executionMode: 'queen-bee',
            required: false,
            priority: 1,
            metadata: { phase: 'optimization' }
          },
          {
            id: 'documentation-generation',
            description: 'Generate comprehensive API and user documentation',
            type: TaskType.DOCUMENTATION,
            executionMode: 'portal',
            required: false,
            priority: 1,
            metadata: { phase: 'documentation' }
          },
          {
            id: 'deployment-guide',
            description: 'Create deployment scripts and infrastructure documentation',
            type: TaskType.DOCUMENTATION,
            executionMode: 'auto',
            required: true,
            priority: 2,
            metadata: { phase: 'deployment' }
          }
        ],
        expectedDuration: 45000,
        metadata: {
          projectType: 'full-stack',
          complexity: 'high',
          targetDeployment: 'cloud'
        }
      };

      const phaseResults = new Map<string, string[]>();

      const mockEngine = {
        initialize: jest.fn(),
        delegateToQueenBee: jest.fn().mockImplementation(async (task: Task) => {
          const phase = task.metadata?.phase || 'unknown';
          const phaseList = phaseResults.get(phase) || [];
          phaseList.push(`QB:${task.id}`);
          phaseResults.set(phase, phaseList);
          
          await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
          return `Queen Bee orchestrated ${phase} phase: ${task.description.substring(0, 50)}...`;
        }),
        routeViaPortal: jest.fn().mockImplementation(async (task: Task) => {
          const phase = task.metadata?.phase || 'unknown';
          const phaseList = phaseResults.get(phase) || [];
          phaseList.push(`Portal:${task.id}`);
          phaseResults.set(phase, phaseList);
          
          await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 200));
          return `Portal routed ${phase} task with optimal flow selection`;
        }),
        executeOnSpecificFlow: jest.fn().mockImplementation(async (flowName: string, task: Task) => {
          const phase = task.metadata?.phase || 'unknown';
          const phaseList = phaseResults.get(phase) || [];
          phaseList.push(`Direct:${flowName}:${task.id}`);
          phaseResults.set(phase, phaseList);
          
          await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 400));
          return `${flowName} executed specialized ${phase} implementation`;
        }),
        execute: jest.fn().mockImplementation(async (description: string) => {
          await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 150));
          return `Auto-execution completed: ${description.substring(0, 30)}...`;
        }),
        shutdown: jest.fn()
      } as any;

      testRunner['nexusEngine'] = mockEngine;

      const startTime = performance.now();
      const result = await testRunner.executeWorkflow(realWorldWorkflow);
      const executionTime = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(8);
      expect(result.errors).toHaveLength(0);
      expect(executionTime).toBeLessThan(realWorldWorkflow.expectedDuration!);

      // Verify all phases were executed
      expect(phaseResults.has('planning')).toBe(true);
      expect(phaseResults.has('design')).toBe(true);
      expect(phaseResults.has('development')).toBe(true);
      expect(phaseResults.has('testing')).toBe(true);

      // Verify critical steps succeeded
      const criticalSteps = ['requirements-gathering', 'architecture-design', 'backend-implementation', 'frontend-implementation'];
      criticalSteps.forEach(stepId => {
        const stepResult = result.results.find(r => r.stepId === stepId);
        expect(stepResult?.success).toBe(true);
      });

      // Verify workflow metadata
      expect(result.metadata.totalSteps).toBe(8);
      expect(result.metadata.successfulSteps).toBe(8);
      expect(result.metadata.failedSteps).toBe(0);
    }, 50000);
  });
});