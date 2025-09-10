import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { NexusEngine } from '../../core/nexus-engine.js';
import { Logger } from '../../utils/logger.js';

export const portalCommand = new Command('portal')
  .description('Use portal mode for automatic flow routing')
  .argument('<task>', 'Task description to execute')
  .option('-f, --flow <name>', 'Force specific flow (bypass auto-detection)')
  .option('-t, --type <type>', 'Task type hint (coding, research, analysis, etc.)')
  .option('-p, --priority <level>', 'Task priority (1-5)', '1')
  .option('--no-fallback', 'Disable fallback chain on failure')
  .option('--dry-run', 'Show which flow would be selected without executing')
  .action(async (task, options) => {
    const logger = new Logger('Portal');
    let spinner: any;

    try {
      console.log(chalk.blue('🌐 Portal Mode - Intelligent Flow Routing\n'));

      spinner = ora('Initializing Nexus Engine...').start();
      const engine = new NexusEngine(options.config);
      await engine.initialize();
      spinner.succeed('Engine initialized');

      // Disable Queen Bee for portal mode
      if (engine.isQueenBeeEnabled()) {
        spinner = ora('Disabling Queen Bee for portal mode...').start();
        await engine.disableQueenBee();
        spinner.succeed('Portal mode activated');
      }

      // Show available flows
      const flows = engine.getAvailableFlows();
      console.log(chalk.cyan('🔍 Available flows:'));
      flows.forEach(flow => {
        const status = flow.status === 'available' ? '✅' : 
                      flow.status === 'busy' ? '⏳' : '❌';
        const load = `${flow.currentLoad}/${flow.maxLoad}`;
        console.log(chalk.white(`  ${status} ${flow.name} (${flow.type}) - Load: ${load} - ${flow.capabilities.join(', ')}`));
      });
      console.log();

      if (options.dryRun) {
        // Show which flow would be selected
        spinner = ora('Analyzing task for flow selection...').start();
        
        // Create a test task to see selection logic
        const testTask = {
          id: 'dry-run',
          description: task,
          type: options.type || 'code-generation',
          priority: parseInt(options.priority) || 1,
          status: 'pending' as const,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Get portal instance to check recommendation
        const portal = (engine as any).portal;
        const recommendation = portal?.getRecommendedFlow(testTask);
        
        spinner.succeed('Analysis complete');
        
        if (recommendation) {
          console.log(chalk.green('🎯 Selected flow:'));
          console.log(chalk.white(`  Flow: ${recommendation.name} (${recommendation.type})`));
          console.log(chalk.white(`  Capabilities: ${recommendation.capabilities.join(', ')}`));
          console.log(chalk.white(`  Current load: ${recommendation.currentLoad}/${recommendation.maxLoad}`));
          console.log(chalk.white(`  Status: ${recommendation.status}`));
        } else {
          console.log(chalk.red('❌ No suitable flow found for this task'));
        }
        
        console.log(chalk.yellow('\n💡 Use without --dry-run to execute the task'));
        return;
      }

      // Execute task
      const taskInfo = {
        type: options.type,
        priority: parseInt(options.priority) || 1,
        forceFlow: options.flow,
        enableFallback: options.fallback !== false
      };

      console.log(chalk.yellow('🚀 Executing task:'));
      console.log(chalk.white(`  Description: ${task}`));
      console.log(chalk.white(`  Type: ${taskInfo.type || 'auto-detected'}`));
      console.log(chalk.white(`  Priority: ${taskInfo.priority}`));
      if (taskInfo.forceFlow) {
        console.log(chalk.white(`  Forced flow: ${taskInfo.forceFlow}`));
      }
      console.log();

      spinner = ora('Routing and executing task...').start();

      // Set up event listeners for progress tracking
      engine.on('task-routed', (event) => {
        spinner.text = `Executing on ${event.targetFlow}...`;
      });

      engine.on('flow-status-changed', (event) => {
        if (event.status === 'busy') {
          spinner.text = `${event.name} is processing...`;
        }
      });

      const result = await engine.executeTask(task, taskInfo);

      spinner.succeed('Task completed successfully!');

      console.log(chalk.green('\n✅ Execution Result:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(result);
      console.log(chalk.gray('─'.repeat(80)));

      // Show execution statistics
      console.log(chalk.cyan('\n📊 Execution Statistics:'));
      const status = await engine.getSystemStatus();
      console.log(chalk.white(`  Available flows: ${status.availableFlows}`));
      console.log(chalk.white(`  Active flows: ${status.activeFlows}`));
      
      await engine.shutdown();

    } catch (error: any) {
      if (spinner) {
        spinner.fail('Task execution failed');
      }
      
      console.error(chalk.red('\n❌ Portal execution failed:'));
      console.error(chalk.red(error.message));
      
      // Show helpful suggestions
      console.log(chalk.yellow('\n💡 Troubleshooting tips:'));
      console.log(chalk.white('  • Check if flows are properly configured: nexus-flow status'));
      console.log(chalk.white('  • Try forcing a specific flow: --flow <flow-name>'));
      console.log(chalk.white('  • Enable verbose logging: --verbose'));
      console.log(chalk.white('  • Initialize configuration: nexus-flow init'));
      
      if (options.verbose && error.stack) {
        console.error(chalk.gray('\nStack trace:'));
        console.error(chalk.gray(error.stack));
      }
      
      process.exit(1);
    }
  });

// Add some helpful examples
portalCommand.addHelpText('after', `
Examples:
  $ nexus-flow portal "Implement user authentication with JWT"
  $ nexus-flow portal "Research best practices for API design" --type research
  $ nexus-flow portal "Fix the bug in user.js" --flow claude-flow --priority 3
  $ nexus-flow portal "Analyze this image" --type analysis --dry-run
  $ nexus-flow portal "Create unit tests" --type testing --no-fallback
`);