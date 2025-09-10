import { EventEmitter } from 'events';
import { NexusConfig, Task, FlowInstance, NexusEvent } from '../types/index.js';
import { ConfigManager } from './config-manager.js';
import { FlowRegistry } from './flow-registry.js';
import { QueenBee } from './queen-bee.js';
import { Portal } from './portal.js';
import { Logger } from '../utils/logger.js';

export class NexusEngine extends EventEmitter {
  private config: ConfigManager;
  private flowRegistry: FlowRegistry;
  private queenBee?: QueenBee;
  private portal: Portal;
  private logger: Logger;
  private initialized = false;

  constructor(configPath?: string) {
    super();
    
    this.logger = new Logger('NexusEngine');
    this.config = new ConfigManager(configPath);
    this.flowRegistry = new FlowRegistry();
    this.portal = new Portal(this.flowRegistry);
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.flowRegistry.on('flow-registered', (flow: FlowInstance) => {
      this.logger.info(`Flow registered: ${flow.name} (${flow.type})`);
      this.emit('flow-registered', flow);
    });

    this.flowRegistry.on('flow-status-changed', (event) => {
      this.logger.debug(`Flow status changed: ${event.name} -> ${event.status}`);
      this.emit('flow-status-changed', event);
    });

    this.portal.on('task-routed', (event) => {
      this.logger.info(`Task routed: ${event.taskId} -> ${event.targetFlow}`);
      this.emit('task-routed', event);
    });

    if (this.queenBee) {
      this.queenBee.on('task-delegated', (event) => {
        this.logger.info(`Task delegated: ${event.taskId} -> ${event.targetFlow}`);
        this.emit('task-delegated', event);
      });

      this.queenBee.on('coordination-decision', (event) => {
        this.logger.debug(`Coordination decision: ${event.decision}`);
        this.emit('coordination-decision', event);
      });
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.logger.info('Initializing Nexus Engine...');

      // Load configuration
      await this.config.load();
      const nexusConfig = this.config.getConfig();

      // Initialize flow registry with configured flows
      await this.flowRegistry.initialize(nexusConfig.flows);

      // Initialize Queen Bee if enabled
      if (nexusConfig.queenBee?.enabled) {
        this.queenBee = new QueenBee(
          nexusConfig.queenBee,
          this.flowRegistry,
          this.logger
        );
        await this.queenBee.initialize();
      }

      // Initialize Portal
      await this.portal.initialize(nexusConfig.portal);

      this.initialized = true;
      this.logger.info('Nexus Engine initialized successfully');
      this.emit('initialized');

    } catch (error: any) {
      this.logger.error('Failed to initialize Nexus Engine:', error);
      this.emit('initialization-error', error);
      throw error;
    }
  }

  async executeTask(description: string, options: any = {}): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    const task: Task = {
      id: this.generateTaskId(),
      description,
      type: options.type || 'code-generation',
      priority: options.priority || 1,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: options.metadata || {}
    };

    this.logger.info(`Executing task: ${task.id} - ${task.description}`);

    try {
      let result: string;

      if (this.queenBee?.isEnabled()) {
        // Use Queen Bee for coordination
        result = await this.queenBee.delegateTask(task);
      } else {
        // Use Portal for direct routing
        result = await this.portal.routeTask(task);
      }

      task.status = 'completed';
      task.updatedAt = new Date();
      
      this.emit('task-completed', { taskId: task.id, result });
      return result;

    } catch (error: any) {
      task.status = 'failed';
      task.updatedAt = new Date();
      
      this.logger.error(`Task failed: ${task.id} - ${error.message}`);
      this.emit('task-failed', { taskId: task.id, error: error.message });
      throw error;
    }
  }

  async discoverFlows(): Promise<FlowInstance[]> {
    return await this.flowRegistry.discoverAvailableFlows();
  }

  getAvailableFlows(): FlowInstance[] {
    return this.flowRegistry.getAll();
  }

  getFlowStatus(flowName: string): FlowInstance | undefined {
    return this.flowRegistry.get(flowName);
  }

  async enableQueenBee(config?: any): Promise<void> {
    if (!this.queenBee) {
      const queenBeeConfig = config || this.config.getConfig().queenBee;
      this.queenBee = new QueenBee(
        queenBeeConfig,
        this.flowRegistry,
        this.logger
      );
      await this.queenBee.initialize();
    }
  }

  async disableQueenBee(): Promise<void> {
    if (this.queenBee) {
      await this.queenBee.shutdown();
      this.queenBee = undefined;
    }
  }

  isQueenBeeEnabled(): boolean {
    return this.queenBee?.isEnabled() || false;
  }

  async getSystemStatus(): Promise<{
    initialized: boolean;
    queenBeeEnabled: boolean;
    availableFlows: number;
    activeFlows: number;
    totalTasks: number;
  }> {
    const flows = this.getAvailableFlows();
    const activeFlows = flows.filter(f => f.status === 'available' || f.status === 'busy');

    return {
      initialized: this.initialized,
      queenBeeEnabled: this.isQueenBeeEnabled(),
      availableFlows: flows.length,
      activeFlows: activeFlows.length,
      totalTasks: 0 // TODO: Implement task tracking
    };
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Nexus Engine...');

    if (this.queenBee) {
      await this.queenBee.shutdown();
    }

    await this.portal.shutdown();
    await this.flowRegistry.shutdown();

    this.initialized = false;
    this.emit('shutdown');
    this.logger.info('Nexus Engine shutdown complete');
  }
}