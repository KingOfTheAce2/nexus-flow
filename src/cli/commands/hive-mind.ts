import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { NexusEngine } from '../../core/nexus-engine.js';
import { Logger } from '../../utils/logger.js';

export const hiveMindCommand = new Command('hive-mind')
  .alias('hive')
  .description('Use hive-mind mode for collaborative multi-flow execution')
  .argument('<objective>', 'High-level objective to accomplish')
  .option('--flows <flows>', 'Comma-separated list of specific flows to include')
  .option('--exclude <flows>', 'Comma-separated list of flows to exclude')
  .option('--max-parallel <num>', 'Maximum parallel executions', '3')
  .option('--consensus', 'Require consensus between flows for critical decisions')
  .option('--plan-only', 'Generate execution plan without executing')
  .option('--interactive', 'Interactive mode with user approval for each step')
  .action(async (objective, options) => {
    const logger = new Logger('HiveMind');
    let spinner: any;

    try {
      console.log(chalk.rainbow('🧠 Hive Mind Mode - Collaborative Multi-Flow Intelligence\n'));

      spinner = ora('Initializing Nexus Engine and Hive Mind...').start();
      const engine = new NexusEngine(options.config);
      await engine.initialize();

      // Enable Queen Bee for coordination
      if (!engine.isQueenBeeEnabled()) {
        await engine.enableQueenBee({
          enabled: true,
          primaryFlow: 'claude-flow',
          delegationStrategy: 'adaptive',
          coordination: {
            maxConcurrentTasks: parseInt(options.maxParallel),
            taskTimeout: 600000, // 10 minutes for complex tasks
            retryPolicy: {
              maxRetries: 2,
              backoffMultiplier: 2,
              initialDelay: 2000
            },
            consensus: options.consensus ? {
              required: true,
              threshold: 0.7,
              validators: []
            } : undefined
          }
        });
      }

      spinner.succeed('Hive Mind initialized');

      // Determine participating flows
      const availableFlows = engine.getAvailableFlows();
      let participatingFlows = availableFlows;

      if (options.flows) {
        const requestedFlows = options.flows.split(',').map((f: string) => f.trim());
        participatingFlows = availableFlows.filter(flow => 
          requestedFlows.includes(flow.name) || requestedFlows.includes(flow.type)
        );
      }

      if (options.exclude) {
        const excludedFlows = options.exclude.split(',').map((f: string) => f.trim());
        participatingFlows = participatingFlows.filter(flow => 
          !excludedFlows.includes(flow.name) && !excludedFlows.includes(flow.type)
        );
      }

      if (participatingFlows.length < 2) {
        console.error(chalk.red('❌ Hive Mind requires at least 2 participating flows'));
        console.log(chalk.yellow('💡 Available flows:'));
        availableFlows.forEach(flow => {
          console.log(chalk.white(`  • ${flow.name} (${flow.type}) - ${flow.capabilities.join(', ')}`));
        });
        return;
      }

      console.log(chalk.cyan('🐝 Hive Participants:'));
      participatingFlows.forEach((flow, index) => {
        const role = index === 0 ? '👑 Coordinator' : '🐝 Worker';
        console.log(chalk.white(`  ${role} ${flow.name} (${flow.type}) - ${flow.capabilities.join(', ')}`));
      });
      console.log();

      // Generate execution plan
      spinner = ora('🧠 Hive Mind analyzing objective and creating execution plan...').start();
      
      const executionPlan = await generateHiveMindPlan(objective, participatingFlows, engine);
      
      spinner.succeed('Execution plan generated');

      // Display plan
      console.log(chalk.yellow('📋 Hive Mind Execution Plan:'));
      console.log(chalk.gray('─'.repeat(80)));
      executionPlan.phases.forEach((phase, index) => {
        console.log(chalk.blue(`Phase ${index + 1}: ${phase.name}`));
        console.log(chalk.white(`  Objective: ${phase.objective}`));
        console.log(chalk.white(`  Assigned to: ${phase.assignedFlow}`));
        console.log(chalk.white(`  Dependencies: ${phase.dependencies.length > 0 ? phase.dependencies.join(', ') : 'None'}`));
        if (phase.parallel.length > 0) {
          console.log(chalk.white(`  Parallel tasks: ${phase.parallel.length}`));
        }
        console.log();
      });
      console.log(chalk.gray('─'.repeat(80)));

      if (options.planOnly) {
        console.log(chalk.green('✅ Plan generated successfully! Use without --plan-only to execute.'));
        return;
      }

      // Interactive confirmation if requested
      if (options.interactive) {
        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Execute this Hive Mind plan?',
            default: true
          }
        ]);

        if (!proceed) {
          console.log(chalk.yellow('⚠️ Execution cancelled by user'));
          return;
        }
      }

      // Execute the hive mind plan
      console.log(chalk.rainbow('🚀 Executing Hive Mind Collaboration...\n'));

      const results = await executeHiveMindPlan(executionPlan, engine, {
        interactive: options.interactive,
        consensus: options.consensus
      });

      console.log(chalk.green('\n✅ Hive Mind Execution Complete!\n'));
      
      // Display results
      console.log(chalk.cyan('📊 Collaboration Results:'));
      console.log(chalk.gray('─'.repeat(80)));
      results.forEach((result, index) => {
        console.log(chalk.blue(`Phase ${index + 1}: ${result.phaseName}`));
        console.log(chalk.white(`Status: ${result.success ? '✅ Success' : '❌ Failed'}`));
        console.log(chalk.white(`Executed by: ${result.executedBy}`));
        console.log(chalk.white(`Duration: ${result.duration}ms`));
        if (result.output) {
          console.log(chalk.white(`Output preview: ${result.output.substring(0, 100)}...`));
        }
        if (result.error) {
          console.log(chalk.red(`Error: ${result.error}`));
        }
        console.log();
      });
      console.log(chalk.gray('─'.repeat(80)));

      // Show collaboration statistics
      const successful = results.filter(r => r.success).length;
      const total = results.length;
      const successRate = (successful / total * 100).toFixed(1);
      
      console.log(chalk.cyan('\n🎯 Collaboration Statistics:'));
      console.log(chalk.white(`  Success rate: ${successRate}% (${successful}/${total})`));
      console.log(chalk.white(`  Total duration: ${results.reduce((sum, r) => sum + r.duration, 0)}ms`));
      console.log(chalk.white(`  Participating flows: ${participatingFlows.length}`));
      
      if (options.consensus) {
        console.log(chalk.white(`  Consensus mode: Enabled`));
      }

      await engine.shutdown();

    } catch (error: any) {
      if (spinner) {
        spinner.fail('Hive Mind execution failed');
      }
      
      console.error(chalk.red('\n❌ Hive Mind failed:'));
      console.error(chalk.red(error.message));
      
      console.log(chalk.yellow('\n💡 Troubleshooting tips:'));
      console.log(chalk.white('  • Ensure multiple flows are available and configured'));
      console.log(chalk.white('  • Break down complex objectives into smaller parts'));
      console.log(chalk.white('  • Try excluding problematic flows: --exclude <flow-names>'));
      console.log(chalk.white('  • Use interactive mode for step-by-step control: --interactive'));
      console.log(chalk.white('  • Generate plan first: --plan-only'));
      
      if (options.verbose && error.stack) {
        console.error(chalk.gray('\nStack trace:'));
        console.error(chalk.gray(error.stack));
      }
      
      process.exit(1);
    }
  });

// Helper function to generate execution plan
async function generateHiveMindPlan(objective: string, flows: any[], engine: NexusEngine): Promise<any> {
  // This would typically use the primary flow to generate a comprehensive plan
  // For now, we'll create a simplified plan structure
  
  const phases = [
    {
      name: 'Analysis & Planning',
      objective: `Analyze the objective: "${objective}" and create detailed specifications`,
      assignedFlow: flows.find(f => f.capabilities.includes('analysis'))?.name || flows[0].name,
      dependencies: [],
      parallel: [],
      estimatedTime: 60000
    },
    {
      name: 'Core Implementation',
      objective: 'Implement the main functionality based on the analysis',
      assignedFlow: flows.find(f => f.capabilities.includes('coding'))?.name || flows[1]?.name || flows[0].name,
      dependencies: ['Analysis & Planning'],
      parallel: [],
      estimatedTime: 180000
    },
    {
      name: 'Testing & Validation',
      objective: 'Create tests and validate the implementation',
      assignedFlow: flows.find(f => f.capabilities.includes('testing'))?.name || flows[0].name,
      dependencies: ['Core Implementation'],
      parallel: [],
      estimatedTime: 90000
    },
    {
      name: 'Documentation & Review',
      objective: 'Generate documentation and perform final review',
      assignedFlow: flows.find(f => f.capabilities.includes('documentation'))?.name || flows[0].name,
      dependencies: ['Testing & Validation'],
      parallel: ['Quality Assurance'],
      estimatedTime: 60000
    }
  ];

  // Add parallel quality assurance if we have enough flows
  if (flows.length >= 3) {
    phases.push({
      name: 'Quality Assurance',
      objective: 'Perform quality review and suggest improvements',
      assignedFlow: flows[flows.length - 1].name,
      dependencies: ['Core Implementation'],
      parallel: [],
      estimatedTime: 45000
    });
  }

  return {
    objective,
    totalPhases: phases.length,
    estimatedDuration: phases.reduce((sum, p) => sum + p.estimatedTime, 0),
    phases,
    collaborationStrategy: 'sequential-with-parallel'
  };
}

// Helper function to execute hive mind plan
async function executeHiveMindPlan(plan: any, engine: NexusEngine, options: any): Promise<any[]> {
  const results = [];
  const completedPhases = new Set<string>();

  for (const phase of plan.phases) {
    // Check dependencies
    const dependenciesMet = phase.dependencies.every((dep: string) => completedPhases.has(dep));
    
    if (!dependenciesMet) {
      console.log(chalk.yellow(`⏸️ Waiting for dependencies: ${phase.dependencies.join(', ')}`));
      continue;
    }

    console.log(chalk.blue(`🔄 Executing Phase: ${phase.name}`));
    
    if (options.interactive) {
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: `Execute "${phase.name}" on ${phase.assignedFlow}?`,
          default: true
        }
      ]);

      if (!proceed) {
        console.log(chalk.yellow(`⏭️ Skipping phase: ${phase.name}`));
        continue;
      }
    }

    const spinner = ora(`${phase.assignedFlow} executing: ${phase.name}...`).start();
    const startTime = Date.now();

    try {
      const result = await engine.executeTask(phase.objective, {
        type: 'orchestration',
        priority: 3,
        forceFlow: phase.assignedFlow,
        metadata: {
          phase: phase.name,
          hiveMind: true
        }
      });

      const duration = Date.now() - startTime;
      spinner.succeed(`${phase.name} completed by ${phase.assignedFlow}`);

      results.push({
        phaseName: phase.name,
        success: true,
        executedBy: phase.assignedFlow,
        duration,
        output: result
      });

      completedPhases.add(phase.name);

    } catch (error: any) {
      const duration = Date.now() - startTime;
      spinner.fail(`${phase.name} failed on ${phase.assignedFlow}`);

      results.push({
        phaseName: phase.name,
        success: false,
        executedBy: phase.assignedFlow,
        duration,
        error: error.message
      });

      if (options.interactive) {
        const { continueExecution } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continueExecution',
            message: 'Phase failed. Continue with remaining phases?',
            default: false
          }
        ]);

        if (!continueExecution) {
          break;
        }
      }
    }
  }

  return results;
}

// Add helpful examples
hiveMindCommand.addHelpText('after', `
Examples:
  $ nexus-flow hive-mind "Build a complete user authentication system"
  $ nexus-flow hive "Create a REST API with documentation and tests" --interactive
  $ nexus-flow hive "Optimize database performance" --flows claude-flow,deepseek-flow
  $ nexus-flow hive "Research and implement caching strategy" --consensus
  $ nexus-flow hive "Complex refactoring project" --plan-only --max-parallel 2

Hive Mind Features:
  • Multi-flow collaboration on complex objectives
  • Intelligent task decomposition and delegation
  • Parallel execution where appropriate
  • Consensus-based decision making (optional)
  • Interactive supervision and approval
  • Comprehensive execution planning
`);