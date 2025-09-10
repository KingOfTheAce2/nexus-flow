import { EventEmitter } from 'events';
import { 
  Task, 
  QueenBeeConfig, 
  DelegationStrategy, 
  DelegationDecision, 
  TaskType,
  FlowInstance 
} from '../types/index.js';
import { FlowRegistry } from './flow-registry.js';
import { Logger } from '../utils/logger.js';

export class QueenBee extends EventEmitter {
  private config: QueenBeeConfig;
  private flowRegistry: FlowRegistry;
  private logger: Logger;
  private activeTasks = new Map<string, Task>();
  private delegationHistory: DelegationDecision[] = [];
  private performanceMetrics = new Map<string, {
    successRate: number;
    avgExecutionTime: number;
    totalTasks: number;
  }>();

  constructor(
    config: QueenBeeConfig,
    flowRegistry: FlowRegistry,
    logger: Logger
  ) {
    super();
    this.config = config;
    this.flowRegistry = flowRegistry;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Queen Bee orchestrator...');
    
    // Set up event listeners for flow status changes
    this.flowRegistry.on('flow-status-changed', (event) => {
      this.handleFlowStatusChange(event);
    });

    this.logger.info(`Queen Bee initialized with strategy: ${this.config.delegationStrategy}`);
  }

  async delegateTask(task: Task): Promise<string> {
    this.logger.info(`Queen Bee delegating task: ${task.id} - ${task.description}`);

    try {
      // Add task to active tasks
      this.activeTasks.set(task.id, task);

      // Make delegation decision
      const decision = await this.makeSelectionDecision(task);
      
      if (!decision) {
        throw new Error('No suitable flow found for task delegation');
      }

      this.logger.info(`Delegating task ${task.id} to ${decision.targetFlow} (confidence: ${decision.confidence})`);
      
      // Record delegation decision
      this.delegationHistory.push(decision);
      this.emit('task-delegated', {
        taskId: task.id,
        targetFlow: decision.targetFlow,
        reason: decision.reason,
        confidence: decision.confidence
      });

      // Execute task on selected flow
      const startTime = Date.now();
      const result = await this.executeTaskOnFlow(decision.targetFlow, task);
      const executionTime = Date.now() - startTime;

      // Update performance metrics
      this.updatePerformanceMetrics(decision.targetFlow, true, executionTime);

      // Remove from active tasks
      this.activeTasks.delete(task.id);

      return result;

    } catch (error: any) {
      this.logger.error(`Task delegation failed for ${task.id}: ${error.message}`);
      
      // Update performance metrics for failure
      const lastDecision = this.delegationHistory[this.delegationHistory.length - 1];
      if (lastDecision?.taskId === task.id) {
        this.updatePerformanceMetrics(lastDecision.targetFlow, false, 0);
      }

      // Try fallback if available
      if (this.config.coordination.retryPolicy.maxRetries > 0) {
        return await this.retryTaskWithFallback(task, error);
      }

      this.activeTasks.delete(task.id);
      throw error;
    }
  }

  private async makeSelectionDecision(task: Task): Promise<DelegationDecision | null> {
    const availableFlows = this.flowRegistry.getAvailable();
    
    if (availableFlows.length === 0) {
      return null;
    }

    let selectedFlow: FlowInstance;
    let reason: string;
    let confidence: number;
    let alternatives: string[] = [];

    switch (this.config.delegationStrategy) {
      case DelegationStrategy.CAPABILITY_BASED:
        const result = this.selectByCapability(task, availableFlows);
        selectedFlow = result.flow;
        reason = result.reason;
        confidence = result.confidence;
        alternatives = result.alternatives;
        break;

      case DelegationStrategy.LOAD_BALANCED:
        selectedFlow = this.selectByLoad(availableFlows);
        reason = `Load balancing - current load: ${selectedFlow.currentLoad}/${selectedFlow.maxLoad}`;
        confidence = 0.8;
        alternatives = availableFlows.slice(0, 3).map(f => f.name);
        break;

      case DelegationStrategy.PRIORITY_BASED:
        selectedFlow = this.selectByPriority(availableFlows, task);
        reason = `Priority-based selection for task priority ${task.priority}`;
        confidence = 0.7;
        alternatives = availableFlows.slice(0, 2).map(f => f.name);
        break;

      case DelegationStrategy.ROUND_ROBIN:
        selectedFlow = this.selectRoundRobin(availableFlows);
        reason = 'Round-robin selection';
        confidence = 0.6;
        alternatives = [];
        break;

      case DelegationStrategy.ADAPTIVE:
        const adaptiveResult = this.selectAdaptive(task, availableFlows);
        selectedFlow = adaptiveResult.flow;
        reason = adaptiveResult.reason;
        confidence = adaptiveResult.confidence;
        alternatives = adaptiveResult.alternatives;
        break;

      default:
        selectedFlow = availableFlows[0];
        reason = 'Default selection';
        confidence = 0.5;
        alternatives = [];
    }

    return {
      taskId: task.id,
      targetFlow: selectedFlow.name,
      reason,
      confidence,
      alternatives: alternatives.filter(name => name !== selectedFlow.name)
    };
  }

  private selectByCapability(task: Task, flows: FlowInstance[]): {
    flow: FlowInstance;
    reason: string;
    confidence: number;
    alternatives: string[];
  } {
    const taskCapabilities = this.inferTaskCapabilities(task);
    const scored = flows.map(flow => {
      const matchingCaps = flow.capabilities.filter(cap => 
        taskCapabilities.includes(cap)
      );
      const score = matchingCaps.length / Math.max(taskCapabilities.length, 1);
      return { flow, score, matchingCaps };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Secondary sort by performance history
      const perfA = this.performanceMetrics.get(a.flow.name)?.successRate || 0.5;
      const perfB = this.performanceMetrics.get(b.flow.name)?.successRate || 0.5;
      return perfB - perfA;
    });

    const best = scored[0];
    const reason = `Capability match: ${best.matchingCaps.join(', ')} (score: ${best.score.toFixed(2)})`;
    const confidence = Math.min(0.9, 0.5 + best.score * 0.4);
    const alternatives = scored.slice(1, 4).map(s => s.flow.name);

    return { flow: best.flow, reason, confidence, alternatives };
  }

  private inferTaskCapabilities(task: Task): string[] {
    const description = task.description.toLowerCase();
    const capabilities: string[] = [];

    // Task type mapping
    switch (task.type) {
      case TaskType.CODE_GENERATION:
      case TaskType.CODE_REVIEW:
      case TaskType.REFACTORING:
        capabilities.push('coding');
        break;
      case TaskType.RESEARCH:
        capabilities.push('research', 'analysis');
        break;
      case TaskType.ANALYSIS:
        capabilities.push('analysis');
        break;
      case TaskType.DOCUMENTATION:
        capabilities.push('documentation', 'writing');
        break;
      case TaskType.TESTING:
        capabilities.push('testing', 'coding');
        break;
      case TaskType.ORCHESTRATION:
        capabilities.push('coordination', 'orchestration');
        break;
    }

    // Content-based inference
    if (description.includes('code') || description.includes('implement') || description.includes('function')) {
      capabilities.push('coding');
    }
    if (description.includes('research') || description.includes('find') || description.includes('analyze')) {
      capabilities.push('research', 'analysis');
    }
    if (description.includes('image') || description.includes('visual') || description.includes('multimedia')) {
      capabilities.push('multimodal');
    }
    if (description.includes('reason') || description.includes('logic') || description.includes('think')) {
      capabilities.push('reasoning');
    }

    return [...new Set(capabilities)];
  }

  private selectByLoad(flows: FlowInstance[]): FlowInstance {
    return flows.reduce((best, current) => {
      const currentLoad = current.currentLoad / current.maxLoad;
      const bestLoad = best.currentLoad / best.maxLoad;
      return currentLoad < bestLoad ? current : best;
    });
  }

  private selectByPriority(flows: FlowInstance[], task: Task): FlowInstance {
    // For high priority tasks, prefer the primary flow if available
    if (task.priority >= 3) {
      const primaryFlow = flows.find(f => f.name === this.config.primaryFlow);
      if (primaryFlow) return primaryFlow;
    }
    
    // Otherwise, select by load
    return this.selectByLoad(flows);
  }

  private roundRobinIndex = 0;
  private selectRoundRobin(flows: FlowInstance[]): FlowInstance {
    const flow = flows[this.roundRobinIndex % flows.length];
    this.roundRobinIndex++;
    return flow;
  }

  private selectAdaptive(task: Task, flows: FlowInstance[]): {
    flow: FlowInstance;
    reason: string;
    confidence: number;
    alternatives: string[];
  } {
    // Combine multiple strategies with weights
    const capabilityResult = this.selectByCapability(task, flows);
    const loadBalanced = this.selectByLoad(flows);
    
    // Prefer capability match but consider load
    let selectedFlow = capabilityResult.flow;
    let reason = `Adaptive: ${capabilityResult.reason}`;
    let confidence = capabilityResult.confidence;

    // If load difference is significant, prefer less loaded flow
    const capabilityLoadRatio = capabilityResult.flow.currentLoad / capabilityResult.flow.maxLoad;
    const loadBalancedRatio = loadBalanced.currentLoad / loadBalanced.maxLoad;
    
    if (loadBalancedRatio < capabilityLoadRatio - 0.3 && loadBalanced !== capabilityResult.flow) {
      selectedFlow = loadBalanced;
      reason = `Adaptive: Load balancing override (${loadBalancedRatio.toFixed(2)} vs ${capabilityLoadRatio.toFixed(2)})`;
      confidence = 0.75;
    }

    return {
      flow: selectedFlow,
      reason,
      confidence,
      alternatives: capabilityResult.alternatives
    };
  }

  private async executeTaskOnFlow(flowName: string, task: Task): Promise<string> {
    return await this.flowRegistry.executeOnFlow(flowName, task.description);
  }

  private async retryTaskWithFallback(originalTask: Task, originalError: Error): Promise<string> {
    const lastDecision = this.delegationHistory[this.delegationHistory.length - 1];
    const excludeFlows = lastDecision ? [lastDecision.targetFlow] : [];
    
    // Try to find alternative flows
    const availableFlows = this.flowRegistry.getAvailable()
      .filter(f => !excludeFlows.includes(f.name));

    if (availableFlows.length === 0) {
      throw new Error(`No fallback flows available after failure: ${originalError.message}`);
    }

    // Create retry task
    const retryTask = { ...originalTask };
    retryTask.metadata = { 
      ...retryTask.metadata, 
      retryAttempt: (retryTask.metadata?.retryAttempt || 0) + 1,
      originalError: originalError.message
    };

    // Use a simpler strategy for retry (load-based)
    const fallbackFlow = this.selectByLoad(availableFlows);
    
    this.logger.info(`Retrying task ${retryTask.id} on fallback flow: ${fallbackFlow.name}`);

    try {
      return await this.executeTaskOnFlow(fallbackFlow.name, retryTask);
    } catch (fallbackError: any) {
      throw new Error(`Both primary and fallback execution failed. Original: ${originalError.message}, Fallback: ${fallbackError.message}`);
    }
  }

  private updatePerformanceMetrics(flowName: string, success: boolean, executionTime: number): void {
    const current = this.performanceMetrics.get(flowName) || {
      successRate: 0.5,
      avgExecutionTime: 0,
      totalTasks: 0
    };

    const newTotal = current.totalTasks + 1;
    const newSuccessRate = (current.successRate * current.totalTasks + (success ? 1 : 0)) / newTotal;
    const newAvgTime = success ? 
      (current.avgExecutionTime * current.totalTasks + executionTime) / newTotal :
      current.avgExecutionTime;

    this.performanceMetrics.set(flowName, {
      successRate: newSuccessRate,
      avgExecutionTime: newAvgTime,
      totalTasks: newTotal
    });
  }

  private handleFlowStatusChange(event: any): void {
    this.logger.debug(`Flow status changed: ${event.name} -> ${event.status}`);
    
    // Could implement adaptive behavior based on flow status changes
    // For example, redistribute tasks if a flow goes offline
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getActiveTasks(): Task[] {
    return Array.from(this.activeTasks.values());
  }

  getDelegationHistory(limit?: number): DelegationDecision[] {
    if (limit) {
      return this.delegationHistory.slice(-limit);
    }
    return this.delegationHistory;
  }

  getPerformanceMetrics(): Map<string, any> {
    return new Map(this.performanceMetrics);
  }

  getSystemStatus(): {
    activeTasks: number;
    totalDelegations: number;
    strategy: string;
    primaryFlow: string;
  } {
    return {
      activeTasks: this.activeTasks.size,
      totalDelegations: this.delegationHistory.length,
      strategy: this.config.delegationStrategy,
      primaryFlow: this.config.primaryFlow
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Queen Bee orchestrator...');
    
    // Wait for active tasks to complete or timeout
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeTasks.size > 0 && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.activeTasks.size > 0) {
      this.logger.warn(`Shutting down with ${this.activeTasks.size} active tasks remaining`);
    }

    this.activeTasks.clear();
    this.logger.info('Queen Bee orchestrator shutdown complete');
  }
}