import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { FlowInstance, FlowConfig, FlowType, FlowStatus, Task, TaskResult } from '../types/index.js';
import { AdapterFactory } from '../adapters/adapter-factory.js';
import { BaseFlowAdapter } from '../adapters/base-flow-adapter.js';
import { WebAuthManager } from '../adapters/web-auth-manager.js';
import { Logger } from '../utils/logger.js';

export class FlowRegistry extends EventEmitter {
  private flows = new Map<string, FlowInstance>();
  private adapters = new Map<string, BaseFlowAdapter>();
  private healthChecks = new Map<string, NodeJS.Timeout>();
  private adapterFactory: AdapterFactory;
  private authManager: WebAuthManager;
  private logger: Logger;

  constructor() {
    super();
    this.logger = new Logger('FlowRegistry');
    this.adapterFactory = AdapterFactory.getInstance();
    this.authManager = new WebAuthManager();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.authManager.on('auth-success', (event) => {
      this.logger.info(`Authentication successful for ${event.flowType}`);
      this.emit('auth-success', event);
    });

    this.authManager.on('auth-error', (event) => {
      this.logger.error(`Authentication failed for ${event.flowType}: ${event.error}`);
      this.emit('auth-error', event);
    });
  }

  async initialize(flowConfigs: FlowConfig[]): Promise<void> {
    this.logger.info('Initializing Flow Registry with adapter system...');
    
    for (const config of flowConfigs) {
      if (config.enabled) {
        await this.registerFlowWithAdapter(config);
      }
    }

    // Start periodic health checks
    this.startHealthMonitoring();
    
    this.logger.info(`Flow Registry initialized with ${this.flows.size} flows`);
  }

  private async registerFlowWithAdapter(config: FlowConfig): Promise<void> {
    try {
      // Create adapter for the flow type
      const adapter = await this.adapterFactory.createAdapterForFlow(config.type, {
        ...config.config,
        priority: config.priority,
        capabilities: this.mapCapabilitiesToAdapterFormat(config.capabilities || [])
      });

      // Set up adapter event handlers
      this.setupAdapterEventHandlers(adapter, config.name);

      // Initialize the adapter
      await adapter.initialize();

      // Create flow instance
      const flow: FlowInstance = {
        name: config.name,
        type: config.type,
        status: adapter.getStatus(),
        capabilities: config.capabilities || [],
        currentLoad: adapter.getCurrentLoad(),
        maxLoad: adapter.getMaxLoad(),
        lastActivity: new Date()
      };

      // Store both flow and adapter
      this.flows.set(config.name, flow);
      this.adapters.set(config.name, adapter);

      this.logger.info(`Registered flow: ${config.name} (${config.type})`);
      this.emit('flow-registered', flow);

    } catch (error: any) {
      this.logger.error(`Failed to register flow ${config.name}:`, error);
      
      // Create a failed flow instance
      const flow: FlowInstance = {
        name: config.name,
        type: config.type,
        status: FlowStatus.ERROR,
        capabilities: config.capabilities || [],
        currentLoad: 0,
        maxLoad: config.config.maxConcurrentTasks || 3,
        lastActivity: new Date()
      };
      
      this.flows.set(config.name, flow);
    }
  }

  private setupAdapterEventHandlers(adapter: BaseFlowAdapter, flowName: string): void {
    adapter.on('status-changed', (event) => {
      const flow = this.flows.get(flowName);
      if (flow) {
        flow.status = event.newStatus;
        flow.lastActivity = new Date();
        this.emit('flow-status-changed', { name: flowName, status: event.newStatus });
      }
    });

    adapter.on('load-changed', (event) => {
      const flow = this.flows.get(flowName);
      if (flow) {
        flow.currentLoad = event.currentLoad;
        flow.maxLoad = event.maxLoad;
        flow.lastActivity = new Date();
        this.emit('flow-load-changed', { name: flowName, currentLoad: event.currentLoad, maxLoad: event.maxLoad });
      }
    });

    adapter.on('execution-error', (event) => {
      this.logger.warn(`Execution error in ${flowName}:`, event.error);
      this.emit('flow-execution-error', { name: flowName, ...event });
    });
  }

  private mapCapabilitiesToAdapterFormat(capabilities: string[]): any {
    // Map string capabilities to adapter capability format
    const adapterCapabilities = {
      codeGeneration: capabilities.includes('coding') || capabilities.includes('code-generation'),
      codeReview: capabilities.includes('code-review') || capabilities.includes('review'),
      research: capabilities.includes('research'),
      analysis: capabilities.includes('analysis'),
      documentation: capabilities.includes('documentation') || capabilities.includes('docs'),
      testing: capabilities.includes('testing'),
      refactoring: capabilities.includes('refactoring'),
      orchestration: capabilities.includes('orchestration') || capabilities.includes('coordination'),
      hiveMind: capabilities.includes('hive-mind') || capabilities.includes('swarm'),
      swarmCoordination: capabilities.includes('swarm') || capabilities.includes('coordination'),
      mcp: capabilities.includes('mcp') || capabilities.includes('tools'),
      webAuth: true // Default to supporting web auth
    };
    
    return adapterCapabilities;
  }

  // Legacy method - kept for compatibility
  private async testFlowHealth(config: FlowConfig): Promise<boolean> {
    // Use adapter health check if available
    try {
      const adapter = this.adapters.get(config.name);
      if (adapter) {
        return await adapter.checkHealth();
      }
    } catch (error) {
      // Fall back to legacy method
    }
    
    return new Promise((resolve, reject) => {
      if (config.config.command) {
        resolve(true);
      } else if (config.config.endpoint) {
        resolve(true);
      } else {
        reject(new Error('No command or endpoint configured'));
      }
    });
  }

  async executeOnFlow(flowName: string, task: Task): Promise<TaskResult> {
    const flow = this.flows.get(flowName);
    const adapter = this.adapters.get(flowName);
    
    if (!flow || !adapter) {
      throw new Error(`Flow not found: ${flowName}`);
    }

    if (!adapter.canAcceptTask()) {
      throw new Error(`Flow not available: ${flowName} (status: ${flow.status}, load: ${flow.currentLoad}/${flow.maxLoad})`);
    }

    // Check authentication if required
    if (adapter.getCapabilities().webAuth && !adapter.isAuthenticated()) {
      this.logger.info(`Attempting authentication for ${flowName}...`);
      const authSuccess = await this.authenticateFlow(flow.type);
      if (!authSuccess) {
        throw new Error(`Authentication required for ${flowName}. Please authenticate and try again.`);
      }
    }

    try {
      this.logger.debug(`Executing task on ${flowName}: ${task.id}`);
      const result = await adapter.executeTask(task);
      
      this.logger.info(`Task completed on ${flowName}: ${task.id} (success: ${result.success})`);
      return result;
      
    } catch (error: any) {
      this.logger.error(`Task execution failed on ${flowName}:`, error);
      throw error;
    }
  }

  async executeTask(task: Task): Promise<TaskResult> {
    // Find the best adapter for this task
    const bestFlow = this.getBestMatch({
      capabilities: [task.type],
      priority: task.priority
    });

    if (!bestFlow) {
      throw new Error(`No available flow found for task type: ${task.type}`);
    }

    return await this.executeOnFlow(bestFlow.name, task);
  }

  get(name: string): FlowInstance | undefined {
    return this.flows.get(name);
  }

  getAll(): FlowInstance[] {
    return Array.from(this.flows.values());
  }

  getAvailable(): FlowInstance[] {
    return Array.from(this.flows.values()).filter(
      flow => flow.status === FlowStatus.AVAILABLE && flow.currentLoad < flow.maxLoad
    );
  }

  getByCapability(capability: string): FlowInstance[] {
    return Array.from(this.flows.values()).filter(
      flow => flow.capabilities.includes(capability) && 
              flow.status === FlowStatus.AVAILABLE
    );
  }

  getBestMatch(requirements: {
    capabilities?: string[];
    priority?: number;
    excludeFlows?: string[];
  }): FlowInstance | null {
    let candidates = this.getAvailable();

    // Filter by excluded flows
    if (requirements.excludeFlows) {
      candidates = candidates.filter(f => !requirements.excludeFlows!.includes(f.name));
    }

    // Filter by capabilities
    if (requirements.capabilities && requirements.capabilities.length > 0) {
      candidates = candidates.filter(flow =>
        requirements.capabilities!.some(cap => flow.capabilities.includes(cap))
      );
    }

    if (candidates.length === 0) return null;

    // Sort by current load (prefer less loaded flows)
    candidates.sort((a, b) => {
      const loadDiff = a.currentLoad / a.maxLoad - b.currentLoad / b.maxLoad;
      if (loadDiff !== 0) return loadDiff;
      
      // Secondary sort by last activity (prefer more recently active)
      return b.lastActivity.getTime() - a.lastActivity.getTime();
    });

    return candidates[0];
  }

  async discoverAvailableFlows(): Promise<FlowInstance[]> {
    this.logger.info('Discovering available flows...');
    const discoveredFlows: FlowConfig[] = [];

    // Check for Claude Flow
    if (await this.checkCommand('npx claude-flow@alpha --version') || 
        await this.checkCommand('claude-flow --version')) {
      discoveredFlows.push({
        name: 'claude-flow-discovered',
        type: FlowType.CLAUDE,
        enabled: true,
        config: { 
          claudeFlowPath: 'claude-flow',
          useHiveMind: true,
          maxConcurrentTasks: 4,
          timeout: 30000
        },
        capabilities: ['coding', 'analysis', 'coordination', 'hive-mind', 'mcp']
      });
    }

    // Check for Gemini Flow
    if (await this.checkCommand('npx @clduab11/gemini-flow --version') ||
        await this.checkCommand('gemini-flow --version')) {
      discoveredFlows.push({
        name: 'gemini-flow-discovered',
        type: FlowType.GEMINI,
        enabled: true,
        config: {
          geminiFlowPath: 'gemini-flow',
          maxConcurrentTasks: 6,
          timeout: 25000,
          googleServices: {
            vertexAI: true,
            agentSpace: true,
            coScientist: true
          },
          a2aConfig: {
            enabled: true,
            transport: 'websocket',
            encryption: true
          }
        },
        capabilities: ['coding', 'multimodal', 'research', 'swarm', 'a2a']
      });
    }

    // Register discovered flows using the adapter system
    for (const config of discoveredFlows) {
      if (!this.flows.has(config.name)) {
        await this.registerFlowWithAdapter(config);
      }
    }

    this.logger.info(`Discovered ${discoveredFlows.length} new flows`);
    return this.getAll();
  }

  private async checkCommand(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, { 
        stdio: 'ignore',
        timeout: 5000
      });
      
      child.on('close', (code) => {
        resolve(code !== null && code < 2);
      });

      child.on('error', () => {
        resolve(false);
      });
    });
  }

  private async getOllamaModels(): Promise<string[]> {
    return new Promise((resolve) => {
      const child = spawn('ollama', ['list'], { 
        stdio: ['ignore', 'pipe', 'ignore']
      });

      let output = '';
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', () => {
        const lines = output.split('\n').slice(1); // Skip header
        const models = lines
          .map(line => line.split(/\s+/)[0])
          .filter(model => model && model !== 'NAME');
        resolve(models);
      });

      child.on('error', () => {
        resolve([]);
      });
    });
  }

  private startHealthMonitoring(): void {
    for (const [name, _] of this.flows) {
      const interval = setInterval(async () => {
        await this.checkFlowHealth(name);
      }, 60000); // Check every minute

      this.healthChecks.set(name, interval);
    }
  }

  private async checkFlowHealth(flowName: string): Promise<void> {
    const flow = this.flows.get(flowName);
    const adapter = this.adapters.get(flowName);
    
    if (!flow || !adapter) return;

    try {
      const isHealthy = await adapter.checkHealth();
      
      if (!isHealthy && flow.status === FlowStatus.AVAILABLE) {
        flow.status = FlowStatus.ERROR;
        this.logger.warn(`Flow ${flowName} failed health check`);
        this.emit('flow-status-changed', { name: flowName, status: flow.status });
      } else if (isHealthy && flow.status === FlowStatus.ERROR) {
        flow.status = FlowStatus.AVAILABLE;
        this.logger.info(`Flow ${flowName} recovered`);
        this.emit('flow-status-changed', { name: flowName, status: flow.status });
      }
      
      // Update flow instance with adapter status
      flow.status = adapter.getStatus();
      flow.currentLoad = adapter.getCurrentLoad();
      flow.maxLoad = adapter.getMaxLoad();
      flow.lastActivity = new Date();
      
    } catch (error: any) {
      this.logger.error(`Health check failed for ${flowName}:`, error);
      if (flow.status !== FlowStatus.ERROR) {
        flow.status = FlowStatus.ERROR;
        this.emit('flow-status-changed', { name: flowName, status: flow.status });
      }
    }
  }

  updateFlowStatus(flowName: string, status: FlowStatus): void {
    const flow = this.flows.get(flowName);
    if (flow && flow.status !== status) {
      flow.status = status;
      flow.lastActivity = new Date();
      this.emit('flow-status-changed', { name: flowName, status });
    }
  }

  // Authentication methods
  async authenticateFlow(flowType: FlowType): Promise<boolean> {
    return await this.authManager.authenticateFlow(flowType);
  }

  async authenticateAllFlows(): Promise<{ [key in FlowType]?: boolean }> {
    return await this.authManager.authenticateAllFlows();
  }

  isFlowAuthenticated(flowType: FlowType): boolean {
    return this.authManager.isFlowAuthenticated(flowType);
  }

  getAuthInstructions(flowType: FlowType): string {
    return this.authManager.getAuthInstructions(flowType);
  }

  openAuthUrl(flowType: FlowType): Promise<boolean> {
    return this.authManager.openAuthUrl(flowType);
  }

  // Adapter management methods
  getAdapter(flowName: string): BaseFlowAdapter | undefined {
    return this.adapters.get(flowName);
  }

  getAllAdapters(): BaseFlowAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAdapterFactory(): AdapterFactory {
    return this.adapterFactory;
  }

  getAuthManager(): WebAuthManager {
    return this.authManager;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Flow Registry...');
    
    // Clear all health check intervals
    for (const [_, interval] of this.healthChecks) {
      clearInterval(interval);
    }
    this.healthChecks.clear();

    // Shutdown all adapters
    for (const [name, adapter] of this.adapters) {
      try {
        this.logger.debug(`Shutting down adapter: ${name}`);
        await adapter.shutdown();
      } catch (error: any) {
        this.logger.error(`Error shutting down adapter ${name}:`, error);
      }
    }
    this.adapters.clear();

    // Clear all flows
    this.flows.clear();
    
    this.logger.info('Flow Registry shutdown complete');
  }
}