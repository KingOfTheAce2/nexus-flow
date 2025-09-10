import { EventEmitter } from 'events';
import { Task, TaskResult, TaskType, TaskStatus, FlowType } from '../types/index.js';
import { FlowRegistry } from './flow-registry.js';
import { QueenBee } from './queen-bee.js';
import { Logger } from '../utils/logger.js';

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  taskType: TaskType;
  requiresAuth?: boolean;
  preferredFlow?: FlowType;
  dependencies?: string[];
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
  metadata?: Record<string, any>;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  mode: 'sequential' | 'parallel' | 'adaptive';
  authRequired: boolean;
  estimatedDuration?: number;
  metadata?: Record<string, any>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  currentStep?: string;
  completedSteps: string[];
  failedSteps: string[];
  results: Map<string, TaskResult>;
  errors: Map<string, Error>;
  context: WorkflowContext;
}

export interface WorkflowContext {
  sessionId: string;
  userId?: string;
  workingDirectory?: string;
  environmentVars?: Record<string, string>;
  preferences?: Record<string, any>;
  sharedMemory: Map<string, any>;
}

export interface AgenticWorkflowRequest {
  objective: string;
  mode?: 'portal' | 'queen-bee' | 'hive-mind';
  flows?: FlowType[];
  maxSteps?: number;
  requiresAuth?: boolean;
  context?: Partial<WorkflowContext>;
  preferences?: {
    strategy?: 'speed' | 'quality' | 'balanced';
    collaboration?: 'minimal' | 'moderate' | 'extensive';
    verification?: boolean;
  };
}

export class WorkflowEngine extends EventEmitter {
  private logger: Logger;
  private flowRegistry: FlowRegistry;
  private queenBee?: QueenBee;
  private activeExecutions = new Map<string, WorkflowExecution>();
  private workflowTemplates = new Map<string, Workflow>();

  constructor(flowRegistry: FlowRegistry, queenBee?: QueenBee) {
    super();
    this.logger = new Logger('WorkflowEngine');
    this.flowRegistry = flowRegistry;
    this.queenBee = queenBee;
    this.initializeBuiltInWorkflows();
  }

  private initializeBuiltInWorkflows(): void {
    // Code Generation Workflow
    this.registerWorkflow({
      id: 'code-generation',
      name: 'Code Generation',
      description: 'Generate code with review and testing',
      mode: 'sequential',
      authRequired: true,
      steps: [
        {
          id: 'generate',
          name: 'Generate Code',
          description: 'Generate initial code implementation',
          taskType: TaskType.CODE_GENERATION,
          preferredFlow: FlowType.CLAUDE
        },
        {
          id: 'review',
          name: 'Code Review',
          description: 'Review generated code for quality and best practices',
          taskType: TaskType.CODE_REVIEW,
          dependencies: ['generate']
        },
        {
          id: 'test',
          name: 'Generate Tests',
          description: 'Create comprehensive tests for the code',
          taskType: TaskType.TESTING,
          dependencies: ['generate']
        }
      ]
    });

    // Research and Analysis Workflow
    this.registerWorkflow({
      id: 'research-analysis',
      name: 'Research and Analysis',
      description: 'Comprehensive research with multi-perspective analysis',
      mode: 'parallel',
      authRequired: true,
      steps: [
        {
          id: 'research-primary',
          name: 'Primary Research',
          description: 'Conduct primary research on the topic',
          taskType: TaskType.RESEARCH,
          preferredFlow: FlowType.GEMINI
        },
        {
          id: 'research-secondary',
          name: 'Secondary Research',
          description: 'Gather additional perspectives and sources',
          taskType: TaskType.RESEARCH,
          preferredFlow: FlowType.CLAUDE
        },
        {
          id: 'analyze',
          name: 'Synthesis and Analysis',
          description: 'Analyze and synthesize research findings',
          taskType: TaskType.ANALYSIS,
          dependencies: ['research-primary', 'research-secondary']
        },
        {
          id: 'document',
          name: 'Documentation',
          description: 'Create comprehensive documentation',
          taskType: TaskType.DOCUMENTATION,
          dependencies: ['analyze']
        }
      ]
    });

    // Hive Mind Collaboration Workflow
    this.registerWorkflow({
      id: 'hive-mind-collaboration',
      name: 'Hive Mind Collaboration',
      description: 'Complex multi-agent collaboration using hive mind',
      mode: 'adaptive',
      authRequired: true,
      steps: [
        {
          id: 'decompose',
          name: 'Task Decomposition',
          description: 'Break down complex objective into subtasks',
          taskType: TaskType.ORCHESTRATION,
          preferredFlow: FlowType.CLAUDE,
          metadata: { useHiveMind: true }
        },
        {
          id: 'collaborate',
          name: 'Multi-Agent Collaboration',
          description: 'Execute subtasks with agent coordination',
          taskType: TaskType.ORCHESTRATION,
          dependencies: ['decompose'],
          metadata: { 
            useSwarm: true,
            agentCount: 8,
            consensus: true
          }
        },
        {
          id: 'synthesize',
          name: 'Result Synthesis',
          description: 'Combine and refine results from all agents',
          taskType: TaskType.ANALYSIS,
          dependencies: ['collaborate']
        }
      ]
    });

    this.logger.info(`Initialized ${this.workflowTemplates.size} built-in workflows`);
  }

  registerWorkflow(workflow: Workflow): void {
    this.workflowTemplates.set(workflow.id, workflow);
    this.logger.debug(`Registered workflow: ${workflow.name} (${workflow.id})`);
  }

  getWorkflowTemplates(): Workflow[] {
    return Array.from(this.workflowTemplates.values());
  }

  getWorkflowTemplate(id: string): Workflow | undefined {
    return this.workflowTemplates.get(id);
  }

  async executeAgenticWorkflow(request: AgenticWorkflowRequest): Promise<WorkflowExecution> {
    this.logger.info(`Starting agentic workflow: ${request.objective}`);

    // Create workflow execution context
    const context: WorkflowContext = {
      sessionId: `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...request.context,
      sharedMemory: new Map()
    };

    // Determine the best workflow approach
    const workflow = await this.planAgenticWorkflow(request, context);
    
    // Execute the workflow
    const execution = await this.executeWorkflow(workflow, context);
    
    this.logger.info(`Agentic workflow completed: ${execution.id} (${execution.status})`);
    return execution;
  }

  private async planAgenticWorkflow(request: AgenticWorkflowRequest, context: WorkflowContext): Promise<Workflow> {
    const { objective, mode = 'portal', preferences = {} } = request;

    // Analyze the objective to determine the best approach
    const analysisTask: Task = {
      id: `analysis-${context.sessionId}`,
      description: `Analyze this objective and determine the best workflow approach: "${objective}"`,
      type: TaskType.ANALYSIS,
      priority: 1,
      status: TaskStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        objective,
        mode,
        preferences,
        analysisType: 'workflow-planning'
      }
    };

    // Use the best available flow for analysis
    const analysisResult = await this.flowRegistry.executeTask(analysisTask);
    
    if (!analysisResult.success) {
      this.logger.warn('Workflow analysis failed, using default approach');
    }

    // Create a dynamic workflow based on the objective and mode
    return this.createDynamicWorkflow(objective, mode, preferences, analysisResult);
  }

  private createDynamicWorkflow(
    objective: string, 
    mode: string, 
    preferences: any, 
    analysisResult: TaskResult
  ): Workflow {
    const workflowId = `dynamic-${Date.now()}`;
    const steps: WorkflowStep[] = [];

    switch (mode) {
      case 'hive-mind':
        steps.push(
          {
            id: 'hive-init',
            name: 'Initialize Hive Mind',
            description: 'Set up hive mind coordination for complex objective',
            taskType: TaskType.ORCHESTRATION,
            preferredFlow: FlowType.CLAUDE,
            metadata: { 
              useHiveMind: true,
              topology: 'adaptive',
              consensus: 'majority'
            }
          },
          {
            id: 'hive-execute',
            name: 'Hive Mind Execution',
            description: objective,
            taskType: TaskType.ORCHESTRATION,
            dependencies: ['hive-init'],
            metadata: {
              swarmExecution: true,
              agentCount: 6,
              useConsensus: true
            }
          }
        );
        break;

      case 'queen-bee':
        steps.push(
          {
            id: 'queen-coordinate',
            name: 'Queen Bee Coordination',
            description: 'Use Queen Bee for intelligent task delegation',
            taskType: TaskType.ORCHESTRATION,
            metadata: {
              useQueenBee: true,
              delegation: 'adaptive'
            }
          }
        );
        break;

      default: // portal mode
        // Determine task type from objective
        const taskType = this.inferTaskType(objective);
        steps.push({
          id: 'portal-execute',
          name: 'Portal Execution',
          description: objective,
          taskType,
          metadata: {
            usePortal: true,
            autoRoute: true
          }
        });
        break;
    }

    // Add verification step if requested
    if (preferences.verification) {
      steps.push({
        id: 'verify',
        name: 'Verification',
        description: 'Verify and validate the results',
        taskType: TaskType.CODE_REVIEW,
        dependencies: steps.map(s => s.id),
        metadata: { verificationType: 'quality-assurance' }
      });
    }

    return {
      id: workflowId,
      name: `Dynamic Workflow: ${objective.substring(0, 50)}...`,
      description: `Automatically generated workflow for: ${objective}`,
      steps,
      mode: mode === 'hive-mind' ? 'adaptive' : mode === 'queen-bee' ? 'sequential' : 'sequential',
      authRequired: true,
      metadata: {
        generatedFrom: objective,
        mode,
        preferences
      }
    };
  }

  private inferTaskType(objective: string): TaskType {
    const lower = objective.toLowerCase();
    
    if (lower.includes('code') || lower.includes('implement') || lower.includes('develop')) {
      return TaskType.CODE_GENERATION;
    } else if (lower.includes('review') || lower.includes('analyze') || lower.includes('check')) {
      return TaskType.CODE_REVIEW;
    } else if (lower.includes('research') || lower.includes('find') || lower.includes('investigate')) {
      return TaskType.RESEARCH;
    } else if (lower.includes('test') || lower.includes('validate')) {
      return TaskType.TESTING;
    } else if (lower.includes('document') || lower.includes('explain') || lower.includes('describe')) {
      return TaskType.DOCUMENTATION;
    } else if (lower.includes('refactor') || lower.includes('improve') || lower.includes('optimize')) {
      return TaskType.REFACTORING;
    } else if (lower.includes('coordinate') || lower.includes('orchestrate') || lower.includes('manage')) {
      return TaskType.ORCHESTRATION;
    }
    
    return TaskType.ANALYSIS; // Default fallback
  }

  async executeWorkflow(workflow: Workflow, context: WorkflowContext): Promise<WorkflowExecution> {
    const execution: WorkflowExecution = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workflowId: workflow.id,
      status: 'pending',
      startTime: new Date(),
      completedSteps: [],
      failedSteps: [],
      results: new Map(),
      errors: new Map(),
      context
    };

    this.activeExecutions.set(execution.id, execution);
    this.emit('workflow-started', execution);

    try {
      execution.status = 'running';
      this.emit('workflow-status-changed', execution);

      if (workflow.mode === 'sequential') {
        await this.executeSequentialSteps(workflow, execution);
      } else if (workflow.mode === 'parallel') {
        await this.executeParallelSteps(workflow, execution);
      } else if (workflow.mode === 'adaptive') {
        await this.executeAdaptiveSteps(workflow, execution);
      }

      execution.status = execution.failedSteps.length > 0 ? 'failed' : 'completed';
      execution.endTime = new Date();

      this.emit('workflow-completed', execution);
      return execution;

    } catch (error: any) {
      execution.status = 'failed';
      execution.endTime = new Date();
      this.logger.error(`Workflow execution failed: ${execution.id}`, error);
      this.emit('workflow-failed', { execution, error });
      throw error;
    } finally {
      this.activeExecutions.delete(execution.id);
    }
  }

  private async executeSequentialSteps(workflow: Workflow, execution: WorkflowExecution): Promise<void> {
    const stepMap = new Map(workflow.steps.map(step => [step.id, step]));
    const completed = new Set<string>();

    for (const step of workflow.steps) {
      // Check if dependencies are met
      if (step.dependencies) {
        const unmetDeps = step.dependencies.filter(dep => !completed.has(dep));
        if (unmetDeps.length > 0) {
          throw new Error(`Dependencies not met for step ${step.id}: ${unmetDeps.join(', ')}`);
        }
      }

      execution.currentStep = step.id;
      this.emit('workflow-step-started', { execution, step });

      try {
        const result = await this.executeWorkflowStep(step, execution);
        execution.results.set(step.id, result);
        execution.completedSteps.push(step.id);
        completed.add(step.id);

        this.emit('workflow-step-completed', { execution, step, result });

      } catch (error: any) {
        execution.errors.set(step.id, error);
        execution.failedSteps.push(step.id);
        this.emit('workflow-step-failed', { execution, step, error });
        
        // Stop on first failure in sequential mode
        break;
      }
    }
  }

  private async executeParallelSteps(workflow: Workflow, execution: WorkflowExecution): Promise<void> {
    // Group steps by dependency level
    const levels = this.groupStepsByDependencyLevel(workflow.steps);
    
    for (const levelSteps of levels) {
      const promises = levelSteps.map(async (step) => {
        execution.currentStep = step.id;
        this.emit('workflow-step-started', { execution, step });

        try {
          const result = await this.executeWorkflowStep(step, execution);
          execution.results.set(step.id, result);
          execution.completedSteps.push(step.id);
          this.emit('workflow-step-completed', { execution, step, result });
          return { step, result, success: true };
        } catch (error: any) {
          execution.errors.set(step.id, error);
          execution.failedSteps.push(step.id);
          this.emit('workflow-step-failed', { execution, step, error });
          return { step, error, success: false };
        }
      });

      await Promise.all(promises);
    }
  }

  private async executeAdaptiveSteps(workflow: Workflow, execution: WorkflowExecution): Promise<void> {
    // Adaptive execution uses intelligent routing and dynamic optimization
    if (this.queenBee && this.queenBee.isEnabled()) {
      // Use Queen Bee for coordination
      for (const step of workflow.steps) {
        execution.currentStep = step.id;
        this.emit('workflow-step-started', { execution, step });

        try {
          const task = this.createTaskFromStep(step, execution);
          const result = await this.queenBee.delegateTask(task);
          
          execution.results.set(step.id, {
            success: true,
            output: result,
            executedBy: 'queen-bee',
            executionTime: 0
          });
          execution.completedSteps.push(step.id);
          this.emit('workflow-step-completed', { execution, step, result });

        } catch (error: any) {
          execution.errors.set(step.id, error);
          execution.failedSteps.push(step.id);
          this.emit('workflow-step-failed', { execution, step, error });
        }
      }
    } else {
      // Fall back to sequential execution
      await this.executeSequentialSteps(workflow, execution);
    }
  }

  private async executeWorkflowStep(step: WorkflowStep, execution: WorkflowExecution): Promise<TaskResult> {
    const task = this.createTaskFromStep(step, execution);
    
    // Check if specific flow is preferred
    if (step.preferredFlow) {
      const preferredFlow = this.flowRegistry.get(`${step.preferredFlow}-flow`) ||
                           this.flowRegistry.get(`${step.preferredFlow}-flow-discovered`);
      
      if (preferredFlow && preferredFlow.status === 'available') {
        return await this.flowRegistry.executeOnFlow(preferredFlow.name, task);
      }
    }

    // Use registry to find best flow
    return await this.flowRegistry.executeTask(task);
  }

  private createTaskFromStep(step: WorkflowStep, execution: WorkflowExecution): Task {
    return {
      id: `${execution.id}-${step.id}`,
      description: step.description,
      type: step.taskType,
      priority: 1,
      status: TaskStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...step.metadata,
        workflowId: execution.workflowId,
        executionId: execution.id,
        stepId: step.id,
        sessionId: execution.context.sessionId
      }
    };
  }

  private groupStepsByDependencyLevel(steps: WorkflowStep[]): WorkflowStep[][] {
    const levels: WorkflowStep[][] = [];
    const stepMap = new Map(steps.map(step => [step.id, step]));
    const processed = new Set<string>();

    while (processed.size < steps.length) {
      const currentLevel: WorkflowStep[] = [];
      
      for (const step of steps) {
        if (processed.has(step.id)) continue;
        
        // Check if all dependencies are already processed
        const canExecute = !step.dependencies || 
                          step.dependencies.every(dep => processed.has(dep));
        
        if (canExecute) {
          currentLevel.push(step);
          processed.add(step.id);
        }
      }
      
      if (currentLevel.length === 0) {
        throw new Error('Circular dependency detected in workflow steps');
      }
      
      levels.push(currentLevel);
    }

    return levels;
  }

  getActiveExecutions(): WorkflowExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  getExecution(id: string): WorkflowExecution | undefined {
    return this.activeExecutions.get(id);
  }

  async cancelExecution(id: string): Promise<boolean> {
    const execution = this.activeExecutions.get(id);
    if (!execution) {
      return false;
    }

    execution.status = 'cancelled';
    execution.endTime = new Date();
    this.activeExecutions.delete(id);
    
    this.emit('workflow-cancelled', execution);
    return true;
  }
}