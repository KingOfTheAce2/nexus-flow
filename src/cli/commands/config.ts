import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { existsSync } from 'fs';
import { ConfigManager } from '../../core/config-manager.js';
import { FlowRegistry } from '../../core/flow-registry.js';

export const configCommand = new Command('config')
  .description('Manage nexus-flow configuration');

// Show current configuration
configCommand
  .command('show')
  .description('Display current configuration')
  .option('--path', 'Show configuration file path only')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      
      if (options.path) {
        console.log(configManager.getConfigPath());
        return;
      }
      
      if (!existsSync(configManager.getConfigPath())) {
        console.log(chalk.yellow('⚠️ No configuration file found. Run "nexus-flow init" first.'));
        return;
      }

      await configManager.load();
      const config = configManager.getConfig();

      console.log(chalk.blue('📋 Current Nexus Flow Configuration\n'));
      
      // Flows
      console.log(chalk.cyan('🔗 Configured Flows:'));
      config.flows.forEach((flow, index) => {
        const status = flow.enabled ? '✅' : '❌';
        console.log(chalk.white(`  ${index + 1}. ${status} ${flow.name} (${flow.type})`));
        console.log(chalk.gray(`     Priority: ${flow.priority} | Capabilities: ${flow.capabilities?.join(', ')}`));
      });
      console.log();

      // Queen Bee
      if (config.queenBee) {
        console.log(chalk.cyan('👑 Queen Bee Configuration:'));
        console.log(chalk.white(`  Enabled: ${config.queenBee.enabled ? '✅' : '❌'}`));
        console.log(chalk.white(`  Primary Flow: ${config.queenBee.primaryFlow}`));
        console.log(chalk.white(`  Delegation Strategy: ${config.queenBee.delegationStrategy}`));
        console.log(chalk.white(`  Max Concurrent Tasks: ${config.queenBee.coordination?.maxConcurrentTasks}`));
        console.log();
      }

      // Portal
      if (config.portal) {
        console.log(chalk.cyan('🌐 Portal Configuration:'));
        console.log(chalk.white(`  Default Flow: ${config.portal.defaultFlow}`));
        console.log(chalk.white(`  Auto Detection: ${config.portal.autoDetection ? '✅' : '❌'}`));
        console.log(chalk.white(`  Fallback Chain: ${config.portal.fallbackChain?.join(' → ')}`));
        console.log();
      }

      // Logging
      if (config.logging) {
        console.log(chalk.cyan('📝 Logging Configuration:'));
        console.log(chalk.white(`  Level: ${config.logging.level}`));
        console.log(chalk.white(`  Console: ${config.logging.console ? '✅' : '❌'}`));
        console.log(chalk.white(`  File: ${config.logging.file || 'None'}`));
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to load configuration:'), error.message);
      process.exit(1);
    }
  });

// Edit configuration
configCommand
  .command('edit')
  .description('Interactively edit configuration')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      
      if (!existsSync(configManager.getConfigPath())) {
        console.log(chalk.yellow('⚠️ No configuration file found. Run "nexus-flow init" first.'));
        return;
      }

      await configManager.load();
      const config = configManager.getConfig();

      const { section } = await inquirer.prompt([
        {
          type: 'list',
          name: 'section',
          message: 'What would you like to edit?',
          choices: [
            { name: 'Flows (enable/disable/add/remove)', value: 'flows' },
            { name: 'Queen Bee settings', value: 'queenBee' },
            { name: 'Portal settings', value: 'portal' },
            { name: 'Logging settings', value: 'logging' }
          ]
        }
      ]);

      switch (section) {
        case 'flows':
          await editFlows(configManager, config);
          break;
        case 'queenBee':
          await editQueenBee(configManager, config);
          break;
        case 'portal':
          await editPortal(configManager, config);
          break;
        case 'logging':
          await editLogging(configManager, config);
          break;
      }

      await configManager.save();
      console.log(chalk.green('✅ Configuration updated successfully!'));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to edit configuration:'), error.message);
      process.exit(1);
    }
  });

// Validate configuration
configCommand
  .command('validate')
  .description('Validate current configuration')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      
      if (!existsSync(configManager.getConfigPath())) {
        console.log(chalk.red('❌ No configuration file found. Run "nexus-flow init" first.'));
        return;
      }

      console.log(chalk.blue('🔍 Validating Nexus Flow Configuration...\n'));

      await configManager.load();
      const config = configManager.getConfig();

      let isValid = true;
      const warnings = [];

      // Validate flows
      console.log(chalk.cyan('📝 Checking flows...'));
      if (!config.flows || config.flows.length === 0) {
        console.log(chalk.red('  ❌ No flows configured'));
        isValid = false;
      } else {
        const enabledFlows = config.flows.filter(f => f.enabled);
        if (enabledFlows.length === 0) {
          console.log(chalk.red('  ❌ No flows are enabled'));
          isValid = false;
        } else {
          console.log(chalk.green(`  ✅ ${enabledFlows.length} flows enabled`));
          
          // Test flow availability
          const flowRegistry = new FlowRegistry();
          for (const flow of enabledFlows) {
            // This is a simplified check - in practice we'd test each flow
            console.log(chalk.gray(`     • ${flow.name} (${flow.type})`));
          }
        }
      }

      // Validate Queen Bee
      if (config.queenBee?.enabled) {
        console.log(chalk.cyan('👑 Checking Queen Bee configuration...'));
        const primaryFlow = config.flows.find(f => f.name === config.queenBee?.primaryFlow);
        if (!primaryFlow) {
          console.log(chalk.red(`  ❌ Primary flow "${config.queenBee.primaryFlow}" not found`));
          isValid = false;
        } else if (!primaryFlow.enabled) {
          console.log(chalk.yellow(`  ⚠️ Primary flow "${config.queenBee.primaryFlow}" is disabled`));
          warnings.push('Primary flow is disabled');
        } else {
          console.log(chalk.green(`  ✅ Primary flow "${config.queenBee.primaryFlow}" is valid`));
        }
      }

      // Validate Portal
      if (config.portal) {
        console.log(chalk.cyan('🌐 Checking Portal configuration...'));
        const defaultFlow = config.flows.find(f => f.name === config.portal?.defaultFlow);
        if (!defaultFlow) {
          console.log(chalk.red(`  ❌ Default flow "${config.portal.defaultFlow}" not found`));
          isValid = false;
        } else if (!defaultFlow.enabled) {
          console.log(chalk.yellow(`  ⚠️ Default flow "${config.portal.defaultFlow}" is disabled`));
          warnings.push('Default flow is disabled');
        } else {
          console.log(chalk.green(`  ✅ Default flow "${config.portal.defaultFlow}" is valid`));
        }
      }

      // Show results
      console.log();
      if (isValid) {
        console.log(chalk.green('✅ Configuration is valid!'));
      } else {
        console.log(chalk.red('❌ Configuration has errors'));
        process.exit(1);
      }

      if (warnings.length > 0) {
        console.log(chalk.yellow('⚠️ Warnings:'));
        warnings.forEach(warning => {
          console.log(chalk.yellow(`  • ${warning}`));
        });
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Validation failed:'), error.message);
      process.exit(1);
    }
  });

// Reset configuration
configCommand
  .command('reset')
  .description('Reset configuration to defaults')
  .option('--backup', 'Create backup before reset')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      
      if (options.backup && existsSync(configManager.getConfigPath())) {
        const backupPath = await configManager.createBackup('reset');
        console.log(chalk.blue(`📁 Backup created: ${backupPath}`));
      }

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Reset configuration to defaults? This will overwrite your current settings.',
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('⚠️ Reset cancelled.'));
        return;
      }

      // This will create default configuration
      configManager.updateConfig({
        flows: [],
        queenBee: undefined,
        portal: undefined,
        logging: undefined
      });
      
      await configManager.load(); // This will create defaults
      await configManager.save();

      console.log(chalk.green('✅ Configuration reset to defaults!'));
      console.log(chalk.yellow('💡 Run "nexus-flow init" to set up your flows again.'));

    } catch (error: any) {
      console.error(chalk.red('❌ Reset failed:'), error.message);
      process.exit(1);
    }
  });

// Helper functions for editing different sections
async function editFlows(configManager: ConfigManager, config: any): Promise<void> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do with flows?',
      choices: [
        { name: 'Enable/disable existing flows', value: 'toggle' },
        { name: 'Add a new flow', value: 'add' },
        { name: 'Remove a flow', value: 'remove' },
        { name: 'Change flow priorities', value: 'priority' }
      ]
    }
  ]);

  switch (action) {
    case 'toggle':
      const { toggledFlows } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'toggledFlows',
          message: 'Select flows to enable (unselected will be disabled):',
          choices: config.flows.map((flow: any) => ({
            name: `${flow.name} (${flow.type})`,
            value: flow.name,
            checked: flow.enabled
          }))
        }
      ]);

      config.flows.forEach((flow: any) => {
        flow.enabled = toggledFlows.includes(flow.name);
      });
      break;

    case 'add':
      // Simplified add flow - in practice this would be more comprehensive
      const newFlow = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Flow name:',
          validate: (input) => input.length > 0 ? true : 'Name is required'
        },
        {
          type: 'list',
          name: 'type',
          message: 'Flow type:',
          choices: ['claude-flow', 'gemini-flow', 'qwen-flow', 'deepseek-flow', 'custom']
        },
        {
          type: 'input',
          name: 'command',
          message: 'Command to run this flow:',
          validate: (input) => input.length > 0 ? true : 'Command is required'
        }
      ]);

      config.flows.push({
        name: newFlow.name,
        type: newFlow.type,
        enabled: true,
        config: { command: newFlow.command },
        priority: config.flows.length + 1,
        capabilities: ['general']
      });
      break;

    case 'remove':
      const { flowToRemove } = await inquirer.prompt([
        {
          type: 'list',
          name: 'flowToRemove',
          message: 'Select flow to remove:',
          choices: config.flows.map((flow: any) => ({
            name: `${flow.name} (${flow.type})`,
            value: flow.name
          }))
        }
      ]);

      config.flows = config.flows.filter((flow: any) => flow.name !== flowToRemove);
      break;
  }

  configManager.updateConfig({ flows: config.flows });
}

async function editQueenBee(configManager: ConfigManager, config: any): Promise<void> {
  const queenBeeConfig = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enabled',
      message: 'Enable Queen Bee coordination?',
      default: config.queenBee?.enabled || false
    },
    {
      type: 'list',
      name: 'primaryFlow',
      message: 'Select primary flow:',
      choices: config.flows.filter((f: any) => f.enabled).map((flow: any) => ({
        name: `${flow.name} (${flow.type})`,
        value: flow.name
      })),
      when: (answers: any) => answers.enabled && config.flows.some((f: any) => f.enabled)
    },
    {
      type: 'list',
      name: 'delegationStrategy',
      message: 'Delegation strategy:',
      choices: [
        'capability-based',
        'load-balanced',
        'adaptive',
        'priority-based',
        'round-robin'
      ],
      default: config.queenBee?.delegationStrategy || 'capability-based',
      when: (answers: any) => answers.enabled
    }
  ]);

  if (queenBeeConfig.enabled) {
    config.queenBee = {
      enabled: true,
      primaryFlow: queenBeeConfig.primaryFlow,
      delegationStrategy: queenBeeConfig.delegationStrategy,
      coordination: config.queenBee?.coordination || {
        maxConcurrentTasks: 3,
        taskTimeout: 300000,
        retryPolicy: {
          maxRetries: 2,
          backoffMultiplier: 1.5,
          initialDelay: 1000
        }
      }
    };
  } else {
    config.queenBee = { enabled: false };
  }

  configManager.updateConfig({ queenBee: config.queenBee });
}

async function editPortal(configManager: ConfigManager, config: any): Promise<void> {
  const portalConfig = await inquirer.prompt([
    {
      type: 'list',
      name: 'defaultFlow',
      message: 'Default flow for portal mode:',
      choices: config.flows.filter((f: any) => f.enabled).map((flow: any) => ({
        name: `${flow.name} (${flow.type})`,
        value: flow.name
      })),
      default: config.portal?.defaultFlow
    },
    {
      type: 'confirm',
      name: 'autoDetection',
      message: 'Enable automatic flow detection?',
      default: config.portal?.autoDetection !== false
    }
  ]);

  config.portal = {
    defaultFlow: portalConfig.defaultFlow,
    autoDetection: portalConfig.autoDetection,
    fallbackChain: config.portal?.fallbackChain || config.flows.filter((f: any) => f.enabled).map((f: any) => f.name)
  };

  configManager.updateConfig({ portal: config.portal });
}

async function editLogging(configManager: ConfigManager, config: any): Promise<void> {
  const loggingConfig = await inquirer.prompt([
    {
      type: 'list',
      name: 'level',
      message: 'Logging level:',
      choices: ['debug', 'info', 'warn', 'error'],
      default: config.logging?.level || 'info'
    },
    {
      type: 'confirm',
      name: 'console',
      message: 'Enable console logging?',
      default: config.logging?.console !== false
    },
    {
      type: 'input',
      name: 'file',
      message: 'Log file path (leave empty to disable file logging):',
      default: config.logging?.file || ''
    }
  ]);

  config.logging = {
    level: loggingConfig.level,
    console: loggingConfig.console,
    file: loggingConfig.file || undefined
  };

  configManager.updateConfig({ logging: config.logging });
}