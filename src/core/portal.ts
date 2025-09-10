import { EventEmitter } from 'events';
import { Task, PortalConfig, FlowInstance, TaskType } from '../types/index.js';
import { FlowRegistry } from './flow-registry.js';

export class Portal extends EventEmitter {
  private config?: PortalConfig;
  private flowRegistry: FlowRegistry;
  private routingCache = new Map<string, string>();
  private taskHistory: { pattern: string; flow: string; success: boolean }[] = [];

  constructor(flowRegistry: FlowRegistry) {
    super();
    this.flowRegistry = flowRegistry;
  }

  async initialize(config?: PortalConfig): Promise<void> {
    this.config = config || {
      defaultFlow: 'claude-flow',
      autoDetection: true,
      fallbackChain: ['claude-flow']
    };
  }

  async routeTask(task: Task): Promise<string> {
    try {
      const targetFlow = await this.selectTargetFlow(task);
      
      if (!targetFlow) {
        throw new Error('No available flow found for task routing');
      }

      this.emit('task-routed', {
        taskId: task.id,
        targetFlow: targetFlow.name,
        method: 'portal'
      });

      // Execute task on selected flow
      const result = await this.flowRegistry.executeOnFlow(targetFlow.name, task.description);
      
      // Record success for learning
      this.recordTaskOutcome(task, targetFlow.name, true);
      
      return result;

    } catch (error: any) {
      // Try fallback chain
      const result = await this.tryFallbackChain(task, error);
      if (result) return result;
      
      throw error;
    }
  }

  private async selectTargetFlow(task: Task): Promise<FlowInstance | null> {
    if (!this.config) return null;

    // Check cache first
    const cacheKey = this.generateCacheKey(task);
    const cachedFlow = this.routingCache.get(cacheKey);
    if (cachedFlow) {
      const flow = this.flowRegistry.get(cachedFlow);
      if (flow && flow.status === 'available') {
        return flow;
      }
    }

    let selectedFlow: FlowInstance | null = null;

    if (this.config.autoDetection) {
      selectedFlow = await this.autoDetectBestFlow(task);
    }

    // Fallback to default flow
    if (!selectedFlow) {
      selectedFlow = this.flowRegistry.get(this.config.defaultFlow) || null;
    }

    // Cache the decision
    if (selectedFlow) {
      this.routingCache.set(cacheKey, selectedFlow.name);
    }

    return selectedFlow;
  }

  private async autoDetectBestFlow(task: Task): Promise<FlowInstance | null> {
    const availableFlows = this.flowRegistry.getAvailable();
    if (availableFlows.length === 0) return null;

    // Score flows based on task characteristics
    const scoredFlows = availableFlows.map(flow => ({
      flow,
      score: this.calculateFlowScore(task, flow)
    }));

    // Sort by score (highest first)
    scoredFlows.sort((a, b) => b.score - a.score);

    return scoredFlows[0]?.flow || null;
  }

  private calculateFlowScore(task: Task, flow: FlowInstance): number {
    let score = 0;

    // Base score for availability
    if (flow.status === 'available') score += 10;

    // Load balancing factor
    const loadFactor = 1 - (flow.currentLoad / flow.maxLoad);
    score += loadFactor * 5;

    // Capability matching
    const taskCapabilities = this.inferTaskCapabilities(task);
    const matchingCaps = flow.capabilities.filter(cap => 
      taskCapabilities.includes(cap)
    );
    score += matchingCaps.length * 3;

    // Historical success rate for similar tasks
    const historicalScore = this.getHistoricalScore(task, flow.name);
    score += historicalScore * 2;

    // Flow-specific bonuses
    score += this.getFlowSpecificBonus(task, flow);

    return score;
  }

  private inferTaskCapabilities(task: Task): string[] {
    const description = task.description.toLowerCase();
    const capabilities: string[] = [];

    // Task type based capabilities
    switch (task.type) {
      case TaskType.CODE_GENERATION:
      case TaskType.CODE_REVIEW:
      case TaskType.REFACTORING:
        capabilities.push('coding');
        break;
      case TaskType.RESEARCH:
        capabilities.push('research');
        break;
      case TaskType.ANALYSIS:
        capabilities.push('analysis');
        break;
      case TaskType.DOCUMENTATION:
        capabilities.push('documentation');
        break;
      case TaskType.TESTING:
        capabilities.push('testing', 'coding');
        break;
    }

    // Content-based inference
    const keywords = {
      'coding': ['code', 'implement', 'function', 'class', 'method', 'algorithm'],
      'research': ['research', 'find', 'investigate', 'explore', 'study'],
      'analysis': ['analyze', 'examine', 'evaluate', 'assess', 'review'],
      'multimodal': ['image', 'visual', 'picture', 'diagram', 'chart'],
      'reasoning': ['reason', 'logic', 'think', 'solve', 'problem'],
      'local-inference': ['local', 'offline', 'private', 'self-hosted'],
      'coordination': ['coordinate', 'orchestrate', 'manage', 'organize']
    };

    for (const [capability, words] of Object.entries(keywords)) {
      if (words.some(word => description.includes(word))) {
        capabilities.push(capability);
      }
    }

    return [...new Set(capabilities)];
  }

  private getHistoricalScore(task: Task, flowName: string): number {
    const pattern = this.generateTaskPattern(task);
    const relevantHistory = this.taskHistory.filter(h => 
      h.pattern === pattern && h.flow === flowName
    );

    if (relevantHistory.length === 0) return 0;

    const successRate = relevantHistory.filter(h => h.success).length / relevantHistory.length;
    return successRate; // 0-1 score
  }

  private getFlowSpecificBonus(task: Task, flow: FlowInstance): number {
    let bonus = 0;

    // Prefer Claude for coordination and complex tasks
    if (flow.type === 'claude-flow') {
      if (task.type === TaskType.ORCHESTRATION || task.priority >= 3) {
        bonus += 2;
      }
    }

    // Prefer Gemini for multimodal tasks
    if (flow.type === 'gemini-flow') {
      if (task.description.toLowerCase().includes('image') || 
          task.description.toLowerCase().includes('visual')) {
        bonus += 3;
      }
    }

    // Prefer local flows for privacy-sensitive tasks
    if (flow.capabilities.includes('local-inference')) {
      if (task.description.toLowerCase().includes('private') || 
          task.description.toLowerCase().includes('confidential')) {
        bonus += 2;
      }
    }

    // Prefer specialized coding models
    if (flow.type === 'qwen-flow' || flow.type === 'deepseek-flow') {
      if (task.type === TaskType.CODE_GENERATION || 
          task.type === TaskType.CODE_REVIEW) {
        bonus += 1;
      }
    }

    return bonus;
  }

  private async tryFallbackChain(task: Task, originalError: Error): Promise<string | null> {
    if (!this.config?.fallbackChain) return null;

    for (const flowName of this.config.fallbackChain) {
      const flow = this.flowRegistry.get(flowName);
      if (flow && flow.status === 'available') {
        try {
          const result = await this.flowRegistry.executeOnFlow(flowName, task.description);
          this.recordTaskOutcome(task, flowName, true);
          return result;
        } catch (error) {
          this.recordTaskOutcome(task, flowName, false);
          continue;
        }
      }
    }

    return null;
  }

  private generateCacheKey(task: Task): string {
    const pattern = this.generateTaskPattern(task);
    return `${pattern}-${task.priority}`;
  }

  private generateTaskPattern(task: Task): string {
    // Create a pattern from task characteristics for caching and learning
    const typePrefix = task.type.substring(0, 3);
    const lengthCategory = task.description.length < 100 ? 'short' : 
                          task.description.length < 500 ? 'medium' : 'long';
    
    const capabilities = this.inferTaskCapabilities(task).slice(0, 2).join('-');
    
    return `${typePrefix}-${lengthCategory}-${capabilities}`;
  }

  private recordTaskOutcome(task: Task, flowName: string, success: boolean): void {
    const pattern = this.generateTaskPattern(task);
    
    this.taskHistory.push({ pattern, flow: flowName, success });
    
    // Keep only recent history to prevent memory bloat
    if (this.taskHistory.length > 1000) {
      this.taskHistory = this.taskHistory.slice(-800);
    }

    // Update cache if successful
    if (success) {
      const cacheKey = this.generateCacheKey(task);
      this.routingCache.set(cacheKey, flowName);
    }
  }

  // Direct flow routing methods for explicit user choice
  async routeToFlow(task: Task, flowName: string): Promise<string> {
    const flow = this.flowRegistry.get(flowName);
    if (!flow) {
      throw new Error(`Flow not found: ${flowName}`);
    }

    if (flow.status !== 'available') {
      throw new Error(`Flow not available: ${flowName} (status: ${flow.status})`);
    }

    this.emit('task-routed', {
      taskId: task.id,
      targetFlow: flowName,
      method: 'direct'
    });

    const result = await this.flowRegistry.executeOnFlow(flowName, task.description);
    this.recordTaskOutcome(task, flowName, true);
    
    return result;
  }

  // Flow capability queries
  getCapableFlows(capability: string): FlowInstance[] {
    return this.flowRegistry.getByCapability(capability);
  }

  getRecommendedFlow(task: Task): FlowInstance | null {
    const availableFlows = this.flowRegistry.getAvailable();
    if (availableFlows.length === 0) return null;

    return availableFlows.reduce((best, current) => {
      const bestScore = this.calculateFlowScore(task, best);
      const currentScore = this.calculateFlowScore(task, current);
      return currentScore > bestScore ? current : best;
    });
  }

  // Analytics and monitoring
  getRoutingStats(): {
    totalRoutes: number;
    cacheHitRate: number;
    flowUsage: Map<string, number>;
    successRateByFlow: Map<string, number>;
  } {
    const flowUsage = new Map<string, number>();
    const flowSuccessCount = new Map<string, number>();
    const flowTotalCount = new Map<string, number>();

    for (const record of this.taskHistory) {
      // Update usage count
      flowUsage.set(record.flow, (flowUsage.get(record.flow) || 0) + 1);
      
      // Update success tracking
      const total = flowTotalCount.get(record.flow) || 0;
      flowTotalCount.set(record.flow, total + 1);
      
      if (record.success) {
        const success = flowSuccessCount.get(record.flow) || 0;
        flowSuccessCount.set(record.flow, success + 1);
      }
    }

    const successRateByFlow = new Map<string, number>();
    for (const [flow, total] of flowTotalCount) {
      const success = flowSuccessCount.get(flow) || 0;
      successRateByFlow.set(flow, success / total);
    }

    // Cache hit rate is approximated by routing cache size vs history
    const cacheHitRate = Math.min(1, this.routingCache.size / Math.max(this.taskHistory.length, 1));

    return {
      totalRoutes: this.taskHistory.length,
      cacheHitRate,
      flowUsage,
      successRateByFlow
    };
  }

  clearCache(): void {
    this.routingCache.clear();
  }

  clearHistory(): void {
    this.taskHistory = [];
  }

  async shutdown(): Promise<void> {
    this.clearCache();
    this.clearHistory();
  }
}