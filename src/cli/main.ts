#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { NexusEngine } from '../core/nexus-engine.js';
import { Logger } from '../utils/logger.js';
import { initCommand } from './commands/init.js';
import { portalCommand } from './commands/portal.js';
import { queenCommand } from './commands/queen.js';
import { hiveMindCommand } from './commands/hive-mind.js';
import { configCommand } from './commands/config.js';
import { statusCommand } from './commands/status.js';
import { authCommand } from './commands/auth.js';
import { workflowCommand } from './commands/workflow.js';

const program = new Command();
const logger = new Logger('CLI');

// ASCII Art Banner
const banner = `
███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗      ███████╗██╗      ██████╗ ██╗    ██╗
████╗  ██║██╔════╝╝██╗██╔╝██║   ██║██╔════╝      ██╔════╝██║     ██╔═══██╗██║    ██║
██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗█████╗█████╗  ██║     ██║   ██║██║ █╗ ██║
██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║╚════╝██╔══╝  ██║     ██║   ██║██║███╗██║
██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║      ██║     ███████╗╚██████╔╝╚███╔███╔╝
╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝      ╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝ 
                                                                                      
🌐 Universal AI Orchestrator - Portal to Any Flow | Queen Bee Coordination System
`;

program
  .name('nexus-flow')
  .description('Universal AI orchestrator - portal to any flow with queen bee coordination')
  .version('1.0.0-alpha.1')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-c, --config <path>', 'Config file path')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().verbose) {
      logger.setLevel('debug');
    }
    
    // Show banner for main commands
    const command = thisCommand.name();
    if (['portal', 'queen', 'hive-mind'].includes(command)) {
      console.log(chalk.cyan(banner));
    }
  });

// Add subcommands
program.addCommand(initCommand);
program.addCommand(portalCommand);
program.addCommand(queenCommand);
program.addCommand(hiveMindCommand);
program.addCommand(authCommand);
program.addCommand(workflowCommand);
program.addCommand(configCommand);
program.addCommand(statusCommand);

// Default action - show help or execute quick task
program
  .argument('[task]', 'Task to execute (if no subcommand provided)')
  .action(async (task, options) => {
    if (!task) {
      program.help();
      return;
    }

    console.log(chalk.cyan(banner));
    console.log(chalk.yellow(`🚀 Quick Task Execution: ${task}\n`));

    try {
      const engine = new NexusEngine(options.config);
      await engine.initialize();

      const result = await engine.executeTask(task);
      
      console.log(chalk.green('✅ Task completed successfully!\n'));
      console.log(chalk.white('📝 Result:'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(result);
      console.log(chalk.gray('─'.repeat(60)));

      await engine.shutdown();
      
    } catch (error: any) {
      console.error(chalk.red('❌ Task execution failed:'));
      console.error(chalk.red(error.message));
      
      if (options.verbose && error.stack) {
        console.error(chalk.gray('\nStack trace:'));
        console.error(chalk.gray(error.stack));
      }
      
      process.exit(1);
    }
  });

// Error handling
program.configureOutput({
  writeErr: (str) => process.stderr.write(chalk.red(str))
});

program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    console.log(chalk.cyan(banner));
    console.log(chalk.yellow('Available commands:'));
    console.log(chalk.white('  init       Initialize nexus-flow configuration'));
    console.log(chalk.white('  portal     Use portal mode for automatic flow routing'));
    console.log(chalk.white('  queen      Use queen bee mode for intelligent coordination'));
    console.log(chalk.white('  hive-mind  Use hive-mind mode for collaborative execution'));
    console.log(chalk.white('  auth       Manage authentication for AI flows'));
    console.log(chalk.white('  workflow   Execute advanced agentic workflows'));
    console.log(chalk.white('  config     Manage configuration'));
    console.log(chalk.white('  status     Show system status'));
    console.log();
    console.log(chalk.yellow('Examples:'));
    console.log(chalk.gray('  nexus-flow init'));
    console.log(chalk.gray('  nexus-flow portal "Implement user authentication"'));
    console.log(chalk.gray('  nexus-flow queen "Research best practices for API design"'));
    console.log(chalk.gray('  nexus-flow "Create a hello world function" # Quick execution'));
    console.log();
  }
  process.exit(err.exitCode);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Shutting down gracefully...'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n🛑 Received SIGTERM, shutting down...'));
  process.exit(0);
});

export default program;

// Start CLI if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}