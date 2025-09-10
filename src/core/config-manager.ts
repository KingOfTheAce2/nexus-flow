import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { NexusConfig, FlowType, DelegationStrategy } from '../types/index.js';

export class ConfigManager {
  private configPath: string;
  private config: NexusConfig | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || this.findDefaultConfigPath();
  }

  private findDefaultConfigPath(): string {
    const possiblePaths = [
      './nexus.config.yaml',
      './nexus.config.yml',
      './config/nexus.yaml',
      './config/nexus.yml',
      join(process.cwd(), 'nexus.config.yaml'),
      join(process.cwd(), '.nexus', 'config.yaml')
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return join(process.cwd(), 'nexus.config.yaml');
  }

  async load(): Promise<NexusConfig> {
    if (this.config) return this.config;

    if (!existsSync(this.configPath)) {
      this.config = this.createDefaultConfig();
      await this.save();
      return this.config;
    }

    try {
      const content = readFileSync(this.configPath, 'utf-8');
      this.config = parseYaml(content) as NexusConfig;
      
      // Validate and apply defaults
      this.config = this.validateAndApplyDefaults(this.config);
      
      return this.config;
    } catch (error: any) {
      throw new Error(`Failed to load config from ${this.configPath}: ${error.message}`);
    }
  }

  private createDefaultConfig(): NexusConfig {
    return {
      flows: [
        {
          name: 'claude-flow',
          type: FlowType.CLAUDE,
          enabled: true,
          config: {
            command: 'npx claude-flow@alpha',
            model: 'claude-3-sonnet',
            maxTokens: 4096
          },
          priority: 1,
          capabilities: ['coding', 'analysis', 'coordination']
        },
        {
          name: 'gemini-flow',
          type: FlowType.GEMINI,
          enabled: false,
          config: {
            command: 'npx @clduab11/gemini-flow',
            model: 'gemini-2.5-flash',
            maxTokens: 8192
          },
          priority: 2,
          capabilities: ['coding', 'multimodal', 'research']
        },
        {
          name: 'qwen-flow',
          type: FlowType.QWEN,
          enabled: false,
          config: {
            command: 'ollama run qwen2.5-coder',
            model: 'qwen2.5-coder:7b',
            endpoint: 'http://localhost:11434'
          },
          priority: 3,
          capabilities: ['coding', 'local-inference']
        },
        {
          name: 'deepseek-flow',
          type: FlowType.DEEPSEEK,
          enabled: false,
          config: {
            command: 'ollama run deepseek-r1',
            model: 'deepseek-r1:7b',
            endpoint: 'http://localhost:11434'
          },
          priority: 4,
          capabilities: ['reasoning', 'coding', 'local-inference']
        }
      ],
      queenBee: {
        enabled: true,
        primaryFlow: 'claude-flow',
        delegationStrategy: DelegationStrategy.CAPABILITY_BASED,
        coordination: {
          maxConcurrentTasks: 5,
          taskTimeout: 300000, // 5 minutes
          retryPolicy: {
            maxRetries: 3,
            backoffMultiplier: 1.5,
            initialDelay: 1000
          }
        }
      },
      portal: {
        defaultFlow: 'claude-flow',
        autoDetection: true,
        fallbackChain: ['claude-flow', 'gemini-flow', 'qwen-flow']
      },
      logging: {
        level: 'info',
        console: true,
        file: 'logs/nexus.log'
      }
    };
  }

  private validateAndApplyDefaults(config: NexusConfig): NexusConfig {
    // Ensure all flows have required fields
    config.flows = config.flows.map(flow => ({
      ...flow,
      enabled: flow.enabled !== undefined ? flow.enabled : true,
      priority: flow.priority || 1,
      capabilities: flow.capabilities || ['general']
    }));

    // Ensure Queen Bee config has defaults
    if (config.queenBee) {
      config.queenBee = {
        enabled: config.queenBee.enabled !== undefined ? config.queenBee.enabled : false,
        primaryFlow: config.queenBee.primaryFlow || config.flows[0]?.name || 'claude-flow',
        delegationStrategy: config.queenBee.delegationStrategy || DelegationStrategy.CAPABILITY_BASED,
        coordination: {
          maxConcurrentTasks: config.queenBee.coordination?.maxConcurrentTasks || 3,
          taskTimeout: config.queenBee.coordination?.taskTimeout || 300000,
          retryPolicy: {
            maxRetries: config.queenBee.coordination?.retryPolicy?.maxRetries || 3,
            backoffMultiplier: config.queenBee.coordination?.retryPolicy?.backoffMultiplier || 1.5,
            initialDelay: config.queenBee.coordination?.retryPolicy?.initialDelay || 1000
          }
        }
      };
    }

    // Ensure Portal config has defaults
    if (config.portal) {
      config.portal = {
        defaultFlow: config.portal.defaultFlow || config.flows[0]?.name || 'claude-flow',
        autoDetection: config.portal.autoDetection !== undefined ? config.portal.autoDetection : true,
        fallbackChain: config.portal.fallbackChain || config.flows.map(f => f.name)
      };
    }

    // Ensure logging config has defaults
    config.logging = {
      level: config.logging?.level || 'info',
      console: config.logging?.console !== undefined ? config.logging.console : true,
      file: config.logging?.file
    };

    return config;
  }

  async save(): Promise<void> {
    if (!this.config) {
      throw new Error('No config to save');
    }

    try {
      // Ensure directory exists
      const dir = dirname(this.configPath);
      if (!existsSync(dir)) {
        const { mkdirSync } = await import('fs');
        mkdirSync(dir, { recursive: true });
      }

      const content = stringifyYaml(this.config, {
        indent: 2,
        lineWidth: 100,
        minContentWidth: 0
      });

      writeFileSync(this.configPath, content, 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to save config to ${this.configPath}: ${error.message}`);
    }
  }

  getConfig(): NexusConfig {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }
    return this.config;
  }

  updateConfig(updates: Partial<NexusConfig>): void {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }

    this.config = {
      ...this.config,
      ...updates
    };
  }

  enableFlow(flowName: string): void {
    if (!this.config) return;

    const flow = this.config.flows.find(f => f.name === flowName);
    if (flow) {
      flow.enabled = true;
    }
  }

  disableFlow(flowName: string): void {
    if (!this.config) return;

    const flow = this.config.flows.find(f => f.name === flowName);
    if (flow) {
      flow.enabled = false;
    }
  }

  addFlow(flow: any): void {
    if (!this.config) return;

    // Check if flow already exists
    const existingIndex = this.config.flows.findIndex(f => f.name === flow.name);
    
    if (existingIndex >= 0) {
      this.config.flows[existingIndex] = flow;
    } else {
      this.config.flows.push(flow);
    }
  }

  removeFlow(flowName: string): void {
    if (!this.config) return;

    this.config.flows = this.config.flows.filter(f => f.name !== flowName);
  }

  getConfigPath(): string {
    return this.configPath;
  }

  async createBackup(suffix?: string): Promise<string> {
    const backupPath = `${this.configPath}.backup${suffix ? '.' + suffix : ''}`;
    
    if (existsSync(this.configPath)) {
      const content = readFileSync(this.configPath, 'utf-8');
      writeFileSync(backupPath, content, 'utf-8');
    }
    
    return backupPath;
  }
}