import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { NexusEngine } from '../../core/nexus-engine.js';
import { Logger } from '../../utils/logger.js';

export const queenCommand = new Command('queen')
  .description('Use queen bee mode for intelligent coordination and delegation')
  .argument('<task>', 'Task description to execute')
  .option('-s, --strategy <strategy>', 'Delegation strategy (capability-based, load-balanced, adaptive, priority-based, round-robin)', 'adaptive')
  .option('-t, --type <type>', 'Task type hint (coding, research, analysis, orchestration, etc.)')
  .option('-p, --priority <level>', 'Task priority (1-5)', '1')
  .option('--max-concurrent <num>', 'Maximum concurrent tasks', '3')
  .option('--timeout <ms>', 'Task timeout in milliseconds', '300000')
  .option('--dry-run', 'Show delegation decision without executing')
  .option('--show-metrics', 'Show performance metrics after execution')
  .action(async (task, options) => {
    const logger = new Logger('QueenBee');
    let spinner: any;

    try {
      console.log(chalk.magenta('👑 Queen Bee Mode - Intelligent Coordination & Delegation\n'));

      spinner = ora('Initializing Nexus Engine...').start();
      const engine = new NexusEngine(options.config);
      await engine.initialize();
      spinner.succeed('Engine initialized');

      // Enable Queen Bee if not already enabled
      if (!engine.isQueenBeeEnabled()) {
        spinner = ora('Activating Queen Bee orchestrator...').start();
        const queenConfig = {
          enabled: true,
          primaryFlow: 'claude-flow', // TODO: Get from config
          delegationStrategy: options.strategy,
          coordination: {
            maxConcurrentTasks: parseInt(options.maxConcurrent),
            taskTimeout: parseInt(options.timeout),
            retryPolicy: {
              maxRetries: 2,
              backoffMultiplier: 1.5,
              initialDelay: 1000
            }
          }
        };
        await engine.enableQueenBee(queenConfig);
        spinner.succeed('Queen Bee orchestrator activated');
      }

      // Show available flows and their capabilities
      const flows = engine.getAvailableFlows();
      console.log(chalk.cyan('🔍 Available worker flows:'));
      flows.forEach(flow => {
        const status = flow.status === 'available' ? '🟢' : 
                      flow.status === 'busy' ? '🟡' : '🔴';
        const load = `${flow.currentLoad}/${flow.maxLoad}`;
        console.log(chalk.white(`  ${status} ${flow.name} (${flow.type})`));
        console.log(chalk.gray(`     Load: ${load} | Capabilities: ${flow.capabilities.join(', ')}`));
      });
      console.log();

      if (options.dryRun) {
        console.log(chalk.yellow('🔮 Delegation Analysis (Dry Run)\n'));
        
        spinner = ora('Analyzing task for optimal delegation...').start();
        
        // Create a test task to analyze delegation decision
        const testTask = {
          id: 'dry-run-' + Date.now(),
          description: task,
          type: options.type || 'code-generation',
          priority: parseInt(options.priority) || 1,
          status: 'pending' as const,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Access the queen bee to get delegation decision
        const queenBee = (engine as any).queenBee;
        if (queenBee) {
          try {
            // Make a selection decision without execution
            const decision = await queenBee.makeSelectionDecision(testTask);
            
            spinner.succeed('Delegation analysis complete');
            
            if (decision) {
              console.log(chalk.green('🎯 Delegation Decision:'));
              console.log(chalk.white(`  Selected flow: ${decision.targetFlow}`));
              console.log(chalk.white(`  Strategy: ${options.strategy}`));
              console.log(chalk.white(`  Reason: ${decision.reason}`));
              console.log(chalk.white(`  Confidence: ${(decision.confidence * 100).toFixed(1)}%`));
              
              if (decision.alternatives && decision.alternatives.length > 0) {
                console.log(chalk.white(`  Alternatives: ${decision.alternatives.join(', ')}`));
              }
              
              console.log(chalk.yellow('\n💡 Use without --dry-run to execute the task'));
            } else {
              console.log(chalk.red('❌ No suitable delegation target found'));
            }
          } catch (error: any) {
            spinner.fail('Delegation analysis failed');
            console.error(chalk.red(error.message));
          }
        } else {
          spinner.fail('Queen Bee not available');
        }
        
        return;
      }

      // Execute task with Queen Bee coordination
      const taskInfo = {
        type: options.type,
        priority: parseInt(options.priority) || 1,
        strategy: options.strategy,
        metadata: {
          requestedBy: 'cli',
          timestamp: new Date().toISOString()
        }
      };

      console.log(chalk.yellow('🚀 Queen Bee Task Coordination:'));
      console.log(chalk.white(`  Task: ${task}`));
      console.log(chalk.white(`  Type: ${taskInfo.type || 'auto-detected'}`));
      console.log(chalk.white(`  Priority: ${taskInfo.priority}`));
      console.log(chalk.white(`  Strategy: ${taskInfo.strategy}`));
      console.log(chalk.white(`  Max concurrent: ${options.maxConcurrent}`));
      console.log();

      spinner = ora('Queen Bee analyzing and delegating task...').start();

      // Set up event listeners for detailed progress tracking
      let delegatedTo = '';
      
      engine.on('task-delegated', (event) => {
        delegatedTo = event.targetFlow;
        spinner.text = `Delegated to ${event.targetFlow} (${event.reason})`;
        setTimeout(() => {
          spinner.text = `${event.targetFlow} is processing task...`;
        }, 1000);
      });

      engine.on('coordination-decision', (event) => {
        spinner.text = `Coordination: ${event.decision}`;
      });

      engine.on('flow-status-changed', (event) => {
        if (event.status === 'busy' && event.name === delegatedTo) {
          spinner.text = `${event.name} executing task...`;
        }
      });

      const result = await engine.executeTask(task, taskInfo);

      spinner.succeed('Queen Bee coordination completed!');

      console.log(chalk.green('\n✅ Coordination Result:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(result);
      console.log(chalk.gray('─'.repeat(80)));

      // Show Queen Bee statistics
      const queenBee = (engine as any).queenBee;
      if (queenBee && options.showMetrics) {
        console.log(chalk.cyan('\n📊 Queen Bee Performance Metrics:'));
        
        const status = queenBee.getSystemStatus();
        console.log(chalk.white(`  Strategy: ${status.strategy}`));
        console.log(chalk.white(`  Primary flow: ${status.primaryFlow}`));
        console.log(chalk.white(`  Total delegations: ${status.totalDelegations}`));
        console.log(chalk.white(`  Active tasks: ${status.activeTasks}`));
        
        const metrics = queenBee.getPerformanceMetrics();
        if (metrics.size > 0) {
          console.log(chalk.cyan('\n  Flow Performance:'));
          for (const [flowName, perf] of metrics) {
            console.log(chalk.white(`    ${flowName}: ${(perf.successRate * 100).toFixed(1)}% success, ${perf.avgExecutionTime}ms avg`));
          }
        }
        
        const recentDelegations = queenBee.getDelegationHistory(5);
        if (recentDelegations.length > 0) {
          console.log(chalk.cyan('\n  Recent Delegations:'));
          recentDelegations.forEach(delegation => {
            console.log(chalk.white(`    ${delegation.targetFlow}: ${delegation.reason} (${(delegation.confidence * 100).toFixed(1)}%)`));
          });
        }
      }

      await engine.shutdown();

    } catch (error: any) {
      if (spinner) {
        spinner.fail('Queen Bee coordination failed');
      }
      
      console.error(chalk.red('\n❌ Queen Bee execution failed:'));
      console.error(chalk.red(error.message));
      
      // Show helpful suggestions
      console.log(chalk.yellow('\n💡 Troubleshooting tips:'));
      console.log(chalk.white('  • Ensure multiple flows are configured and available'));
      console.log(chalk.white('  • Check flow capabilities match your task type'));
      console.log(chalk.white('  • Try a different delegation strategy'));
      console.log(chalk.white('  • Increase task timeout if tasks are timing out'));
      console.log(chalk.white('  • Check system status: nexus-flow status'));
      
      if (options.verbose && error.stack) {
        console.error(chalk.gray('\nStack trace:'));
        console.error(chalk.gray(error.stack));
      }
      
      process.exit(1);
    }
  });

// Add helpful examples
queenCommand.addHelpText('after', `
Examples:
  $ nexus-flow queen "Implement user authentication system"
  $ nexus-flow queen "Research and implement caching strategy" --strategy capability-based
  $ nexus-flow queen "Complex refactoring task" --priority 4 --show-metrics
  $ nexus-flow queen "Multi-step deployment process" --type orchestration --dry-run
  $ nexus-flow queen "Performance optimization" --strategy adaptive --max-concurrent 5

Delegation Strategies:
  capability-based  Match tasks to flows based on their capabilities (recommended)
  load-balanced     Distribute tasks evenly across available flows
  adaptive          Smart combination of capability and load balancing
  priority-based    Use primary flow for high-priority tasks
  round-robin       Simple rotation through available flows
`);