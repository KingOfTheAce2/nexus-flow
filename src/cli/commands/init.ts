import { Command } from 'commander';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ConfigManager } from '../../core/config-manager.js';
import { FlowRegistry } from '../../core/flow-registry.js';
import { FlowType } from '../../types/index.js';

export const initCommand = new Command('init')
  .description('Initialize nexus-flow configuration')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('--auto', 'Use automatic configuration with discovered flows')
  .action(async (options) => {
    console.log(chalk.blue('🚀 Initializing Nexus Flow...\n'));

    try {
      const configManager = new ConfigManager();
      const configPath = configManager.getConfigPath();

      // Check if config already exists
      if (existsSync(configPath) && !options.force) {
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: `Configuration already exists at ${configPath}. Overwrite?`,
            default: false
          }
        ]);

        if (!overwrite) {
          console.log(chalk.yellow('⚠️  Initialization cancelled.'));
          return;
        }
      }

      let config;
      
      if (options.auto) {
        console.log(chalk.cyan('🔍 Auto-discovering available flows...'));
        config = await createAutoConfig();
      } else {
        console.log(chalk.cyan('📋 Interactive configuration setup...'));
        config = await createInteractiveConfig();
      }

      // Ensure directories exist
      const logDir = dirname('logs/nexus.log');
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      const configDir = dirname(configPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // Update and save configuration
      configManager.updateConfig(config);
      await configManager.save();

      console.log(chalk.green('✅ Configuration saved successfully!'));
      console.log(chalk.white(`📍 Configuration file: ${configPath}`));
      
      // Show next steps
      console.log(chalk.yellow('\n📝 Next steps:'));
      console.log(chalk.white('  1. Review and customize your configuration file'));
      console.log(chalk.white('  2. Test your setup: nexus-flow status'));
      console.log(chalk.white('  3. Start using: nexus-flow portal "your task"'));
      console.log(chalk.white('  4. Try queen bee mode: nexus-flow queen "complex task"'));

    } catch (error: any) {
      console.error(chalk.red('❌ Initialization failed:'), error.message);
      process.exit(1);
    }
  });

async function createAutoConfig(): Promise<any> {
  const flowRegistry = new FlowRegistry();
  const discoveredFlows = await flowRegistry.discoverAvailableFlows();
  
  console.log(chalk.green(`🎯 Discovered ${discoveredFlows.length} available flows:`));
  discoveredFlows.forEach(flow => {
    console.log(chalk.white(`  • ${flow.name} (${flow.type}) - ${flow.capabilities.join(', ')}`));
  });

  const flows = discoveredFlows.map(flow => ({
    name: flow.name,
    type: flow.type,
    enabled: true,
    config: getDefaultFlowConfig(flow.type),
    priority: getDefaultPriority(flow.type),
    capabilities: flow.capabilities
  }));

  return {
    flows,
    queenBee: {
      enabled: flows.length > 1,
      primaryFlow: flows.find(f => f.type === FlowType.CLAUDE)?.name || flows[0]?.name,
      delegationStrategy: 'adaptive',
      coordination: {
        maxConcurrentTasks: 3,
        taskTimeout: 300000,
        retryPolicy: {
          maxRetries: 2,
          backoffMultiplier: 1.5,
          initialDelay: 1000
        }
      }
    },
    portal: {
      defaultFlow: flows.find(f => f.type === FlowType.CLAUDE)?.name || flows[0]?.name,
      autoDetection: true,
      fallbackChain: flows.slice(0, 3).map(f => f.name)
    }
  };
}

async function createInteractiveConfig(): Promise<any> {
  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'enabledFlows',
      message: 'Which flows would you like to enable?',
      choices: [
        { name: 'Claude Flow (recommended)', value: FlowType.CLAUDE, checked: true },
        { name: 'Gemini Flow', value: FlowType.GEMINI, checked: false },
        { name: 'Qwen Flow (local)', value: FlowType.QWEN, checked: false },
        { name: 'DeepSeek Flow (local)', value: FlowType.DEEPSEEK, checked: false },
        { name: 'Codex Flow', value: FlowType.CODEX, checked: false },
        { name: 'Mistral Flow', value: FlowType.MISTRAL, checked: false }
      ]
    },
    {
      type: 'list',
      name: 'primaryFlow',
      message: 'Which flow should be the primary (queen bee) flow?',
      choices: (answers: any) => answers.enabledFlows.map((flow: FlowType) => ({
        name: getFlowDisplayName(flow),
        value: getFlowName(flow)
      })),
      when: (answers: any) => answers.enabledFlows.length > 0
    },
    {
      type: 'confirm',
      name: 'enableQueenBee',
      message: 'Enable Queen Bee coordination mode?',
      default: true,
      when: (answers: any) => answers.enabledFlows.length > 1
    },
    {
      type: 'list',
      name: 'delegationStrategy',
      message: 'Choose delegation strategy:',
      choices: [
        { name: 'Capability-based (recommended)', value: 'capability-based' },
        { name: 'Load balanced', value: 'load-balanced' },
        { name: 'Adaptive (smart)', value: 'adaptive' },
        { name: 'Priority-based', value: 'priority-based' },
        { name: 'Round-robin', value: 'round-robin' }
      ],
      default: 'capability-based',
      when: (answers: any) => answers.enableQueenBee
    },
    {
      type: 'confirm',
      name: 'enableAutoDetection',
      message: 'Enable automatic flow detection in portal mode?',
      default: true
    },
    {
      type: 'list',
      name: 'logLevel',
      message: 'Choose logging level:',
      choices: [
        { name: 'Info (recommended)', value: 'info' },
        { name: 'Debug (verbose)', value: 'debug' },
        { name: 'Warning only', value: 'warn' },
        { name: 'Errors only', value: 'error' }
      ],
      default: 'info'
    }
  ]);

  const flows = answers.enabledFlows.map((flowType: FlowType) => ({
    name: getFlowName(flowType),
    type: flowType,
    enabled: true,
    config: getDefaultFlowConfig(flowType),
    priority: getDefaultPriority(flowType),
    capabilities: getDefaultCapabilities(flowType)
  }));

  return {
    flows,
    queenBee: {
      enabled: answers.enableQueenBee || false,
      primaryFlow: answers.primaryFlow || flows[0]?.name,
      delegationStrategy: answers.delegationStrategy || 'capability-based',
      coordination: {
        maxConcurrentTasks: 3,
        taskTimeout: 300000,
        retryPolicy: {
          maxRetries: 2,
          backoffMultiplier: 1.5,
          initialDelay: 1000
        }
      }
    },
    portal: {
      defaultFlow: flows[0]?.name || 'claude-flow',
      autoDetection: answers.enableAutoDetection,
      fallbackChain: flows.map(f => f.name)
    },
    logging: {
      level: answers.logLevel || 'info',
      console: true,
      file: 'logs/nexus.log'
    }
  };
}

function getFlowName(flowType: FlowType): string {
  const names = {
    [FlowType.CLAUDE]: 'claude-flow',
    [FlowType.GEMINI]: 'gemini-flow',
    [FlowType.QWEN]: 'qwen-flow',
    [FlowType.DEEPSEEK]: 'deepseek-flow',
    [FlowType.CODEX]: 'codex-flow',
    [FlowType.MISTRAL]: 'mistral-flow',
    [FlowType.COPILOT]: 'copilot-flow',
    [FlowType.LLAMA]: 'llama-flow',
    [FlowType.LOCAL]: 'local-flow'
  };
  return names[flowType] || flowType;
}

function getFlowDisplayName(flowType: FlowType): string {
  const names = {
    [FlowType.CLAUDE]: 'Claude Flow',
    [FlowType.GEMINI]: 'Gemini Flow',
    [FlowType.QWEN]: 'Qwen Flow',
    [FlowType.DEEPSEEK]: 'DeepSeek Flow',
    [FlowType.CODEX]: 'Codex Flow',
    [FlowType.MISTRAL]: 'Mistral Flow',
    [FlowType.COPILOT]: 'Copilot Flow',
    [FlowType.LLAMA]: 'LLaMA Flow',
    [FlowType.LOCAL]: 'Local Flow'
  };
  return names[flowType] || flowType;
}

function getDefaultFlowConfig(flowType: FlowType): any {
  const configs = {
    [FlowType.CLAUDE]: {
      command: 'npx claude-flow@alpha',
      model: 'claude-3-sonnet',
      maxTokens: 4096
    },
    [FlowType.GEMINI]: {
      command: 'npx @clduab11/gemini-flow',
      model: 'gemini-2.5-flash',
      maxTokens: 8192
    },
    [FlowType.QWEN]: {
      command: 'ollama run qwen2.5-coder',
      model: 'qwen2.5-coder:7b',
      endpoint: 'http://localhost:11434'
    },
    [FlowType.DEEPSEEK]: {
      command: 'ollama run deepseek-r1',
      model: 'deepseek-r1:7b',
      endpoint: 'http://localhost:11434'
    },
    [FlowType.CODEX]: {
      command: 'npx @bear_ai/codex-flow',
      model: 'gpt-4',
      maxTokens: 8192
    },
    [FlowType.MISTRAL]: {
      command: 'ollama run mistral',
      model: 'mistral:7b',
      endpoint: 'http://localhost:11434'
    }
  };
  return configs[flowType] || { command: `${flowType}` };
}

function getDefaultPriority(flowType: FlowType): number {
  const priorities = {
    [FlowType.CLAUDE]: 1,
    [FlowType.GEMINI]: 2,
    [FlowType.DEEPSEEK]: 3,
    [FlowType.QWEN]: 4,
    [FlowType.CODEX]: 5,
    [FlowType.MISTRAL]: 6
  };
  return priorities[flowType] || 10;
}

function getDefaultCapabilities(flowType: FlowType): string[] {
  const capabilities = {
    [FlowType.CLAUDE]: ['coding', 'analysis', 'coordination', 'reasoning'],
    [FlowType.GEMINI]: ['coding', 'multimodal', 'research', 'analysis'],
    [FlowType.QWEN]: ['coding', 'local-inference', 'reasoning'],
    [FlowType.DEEPSEEK]: ['reasoning', 'coding', 'local-inference', 'mathematics'],
    [FlowType.CODEX]: ['coding', 'analysis'],
    [FlowType.MISTRAL]: ['general', 'coding', 'local-inference'],
    [FlowType.COPILOT]: ['coding', 'assistance'],
    [FlowType.LLAMA]: ['general', 'local-inference'],
    [FlowType.LOCAL]: ['local-inference', 'privacy']
  };
  return capabilities[flowType] || ['general'];
}