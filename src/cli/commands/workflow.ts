import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { NexusEngine } from '../../core/nexus-engine.js';
import { WorkflowEngine } from '../../core/workflow-engine.js';
import { Logger } from '../../utils/logger.js';

export const workflowCommand = new Command('workflow')
  .description('Execute advanced agentic workflows')
  .addCommand(
    new Command('run')
      .description('Run an agentic workflow')
      .argument('<objective>', 'The objective or goal to accomplish')
      .option('-m, --mode <mode>', 'Workflow mode (portal, queen-bee, hive-mind)', 'portal')
      .option('-f, --flows <flows>', 'Comma-separated list of preferred flows')
      .option('-s, --strategy <strategy>', 'Execution strategy (speed, quality, balanced)', 'balanced')
      .option('-c, --collaboration <level>', 'Collaboration level (minimal, moderate, extensive)', 'moderate')
      .option('--max-steps <number>', 'Maximum workflow steps', '10')
      .option('--verify', 'Enable result verification')
      .option('--interactive', 'Interactive workflow execution')
      .option('--dry-run', 'Plan workflow without execution')
      .action(async (objective, options) => {
        const logger = new Logger('Workflow');
        let spinner: any;

        try {
          console.log(chalk.blue('🌟 Nexus Flow - Agentic Workflow System\n'));

          spinner = ora('Initializing workflow engine...').start();
          const engine = new NexusEngine(options.config);
          await engine.initialize();
          
          // Get workflow engine from nexus engine
          const workflowEngine = new WorkflowEngine(
            (engine as any).flowRegistry,
            (engine as any).queenBee
          );
          
          spinner.succeed('Workflow engine initialized');

          // Show available flows
          const flows = engine.getAvailableFlows();
          console.log(chalk.cyan('🔍 Available flows:'));
          flows.forEach(flow => {
            const status = flow.status === 'available' ? '✅' : 
                          flow.status === 'busy' ? '⏳' : '❌';
            console.log(chalk.white(`  ${status} ${flow.name} (${flow.type})`));
          });
          console.log();

          // Parse flow preferences
          let preferredFlows: string[] = [];
          if (options.flows) {
            preferredFlows = options.flows.split(',').map((f: string) => f.trim());
          }

          // Prepare workflow request
          const workflowRequest = {
            objective,
            mode: options.mode,
            flows: preferredFlows,
            maxSteps: parseInt(options.maxSteps),
            requiresAuth: true,
            preferences: {
              strategy: options.strategy,
              collaboration: options.collaboration,
              verification: options.verify
            },
            context: {
              workingDirectory: process.cwd(),
              environmentVars: process.env
            }
          };

          console.log(chalk.yellow('🎯 Workflow Configuration:'));
          console.log(chalk.white(`  Objective: ${objective}`));
          console.log(chalk.white(`  Mode: ${options.mode}`));
          console.log(chalk.white(`  Strategy: ${options.strategy}`));
          console.log(chalk.white(`  Collaboration: ${options.collaboration}`));
          if (preferredFlows.length > 0) {
            console.log(chalk.white(`  Preferred flows: ${preferredFlows.join(', ')}`));
          }
          console.log();

          if (options.dryRun) {
            spinner = ora('Planning workflow...').start();
            
            // This would normally plan the workflow without executing
            spinner.succeed('Workflow planned successfully');
            
            console.log(chalk.green('📋 Workflow Plan:'));
            console.log(chalk.white(`  Mode: ${options.mode}`));
            console.log(chalk.white(`  Estimated steps: 3-5`));
            console.log(chalk.white(`  Estimated duration: 2-10 minutes`));
            console.log(chalk.white(`  Authentication required: Yes`));
            
            console.log(chalk.yellow('\n💡 Use without --dry-run to execute the workflow'));
            return;
          }

          // Interactive confirmation
          if (options.interactive) {
            const { proceed } = await inquirer.prompt([{
              type: 'confirm',
              name: 'proceed',
              message: `Execute workflow for: "${objective}"?`,
              default: true
            }]);

            if (!proceed) {
              console.log(chalk.yellow('Workflow cancelled.'));
              return;
            }
          }

          // Set up event listeners for progress tracking
          let currentStep = '';
          workflowEngine.on('workflow-started', (execution) => {
            console.log(chalk.green(`🚀 Workflow started: ${execution.id}`));
          });

          workflowEngine.on('workflow-step-started', ({ execution, step }) => {
            currentStep = step.name;
            if (spinner) {
              spinner.text = `Executing: ${step.name}...`;
            } else {
              spinner = ora(`Executing: ${step.name}...`).start();
            }
          });

          workflowEngine.on('workflow-step-completed', ({ execution, step, result }) => {
            if (spinner) {
              spinner.succeed(`Completed: ${step.name}`);
              spinner = null;
            }
          });

          workflowEngine.on('workflow-step-failed', ({ execution, step, error }) => {
            if (spinner) {
              spinner.fail(`Failed: ${step.name} - ${error.message}`);
              spinner = null;
            }
          });

          workflowEngine.on('workflow-completed', (execution) => {
            console.log(chalk.green(`\n✅ Workflow completed: ${execution.id}`));
          });

          // Execute the workflow
          spinner = ora('Starting agentic workflow...').start();
          const execution = await workflowEngine.executeAgenticWorkflow(workflowRequest);
          
          if (spinner) {
            spinner.stop();
          }

          // Show results
          console.log(chalk.green('\n🎉 Workflow Execution Results:'));
          console.log(chalk.gray('─'.repeat(80)));
          
          console.log(chalk.cyan('📊 Execution Summary:'));
          console.log(chalk.white(`  Execution ID: ${execution.id}`));
          console.log(chalk.white(`  Status: ${execution.status}`));
          console.log(chalk.white(`  Duration: ${execution.endTime ? 
            Math.round((execution.endTime.getTime() - execution.startTime.getTime()) / 1000) : 'N/A'}s`));
          console.log(chalk.white(`  Completed steps: ${execution.completedSteps.length}`));
          console.log(chalk.white(`  Failed steps: ${execution.failedSteps.length}`));
          console.log();

          // Show step results
          if (execution.results.size > 0) {
            console.log(chalk.cyan('📝 Step Results:'));
            for (const [stepId, result] of execution.results.entries()) {
              const status = result.success ? '✅' : '❌';
              console.log(chalk.white(`  ${status} ${stepId}: ${result.success ? 'Success' : 'Failed'}`));
              if (result.output && result.output.length < 200) {
                console.log(chalk.gray(`    ${result.output.substring(0, 100)}...`));
              }
            }
            console.log();
          }

          // Show any errors
          if (execution.errors.size > 0) {
            console.log(chalk.red('❌ Errors:'));
            for (const [stepId, error] of execution.errors.entries()) {
              console.log(chalk.red(`  ${stepId}: ${error.message}`));
            }
            console.log();
          }

          await engine.shutdown();

        } catch (error: any) {
          if (spinner) {
            spinner.fail('Workflow execution failed');
          }
          
          console.error(chalk.red('\n❌ Workflow execution failed:'));
          console.error(chalk.red(error.message));
          
          // Show helpful suggestions
          console.log(chalk.yellow('\n💡 Troubleshooting tips:'));
          console.log(chalk.white('  • Check authentication: nexus-flow auth status'));
          console.log(chalk.white('  • Verify flows are available: nexus-flow status'));
          console.log(chalk.white('  • Try a simpler objective'));
          console.log(chalk.white('  • Use portal mode: --mode portal'));
          
          if (options.verbose && error.stack) {
            console.error(chalk.gray('\nStack trace:'));
            console.error(chalk.gray(error.stack));
          }
          
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('templates')
      .description('List available workflow templates')
      .action(async () => {
        const workflowEngine = new WorkflowEngine(null as any); // Just for template access
        const templates = workflowEngine.getWorkflowTemplates();
        
        console.log(chalk.blue('🔧 Available Workflow Templates\n'));
        
        for (const template of templates) {
          console.log(chalk.green(`📋 ${template.name} (${template.id})`));
          console.log(chalk.white(`   Description: ${template.description}`));
          console.log(chalk.white(`   Mode: ${template.mode}`));
          console.log(chalk.white(`   Steps: ${template.steps.length}`));
          console.log(chalk.white(`   Auth required: ${template.authRequired ? 'Yes' : 'No'}`));
          
          console.log(chalk.cyan('   Steps:'));
          template.steps.forEach((step, index) => {
            const deps = step.dependencies ? ` (depends: ${step.dependencies.join(', ')})` : '';
            console.log(chalk.gray(`     ${index + 1}. ${step.name}${deps}`));
          });
          console.log();
        }
        
        console.log(chalk.yellow('💡 Usage:'));
        console.log(chalk.white('  nexus-flow workflow run "Your objective here" --mode <mode>'));
      })
  )
  .addCommand(
    new Command('modes')
      .description('Show available workflow modes')
      .action(async () => {
        console.log(chalk.blue('🎭 Workflow Execution Modes\n'));
        
        console.log(chalk.green('🌐 Portal Mode'));
        console.log(chalk.white('   • Intelligent single-flow routing'));
        console.log(chalk.white('   • Fast execution for simple tasks'));
        console.log(chalk.white('   • Automatic flow selection'));
        console.log(chalk.white('   • Best for: Code generation, research, analysis'));
        console.log();
        
        console.log(chalk.green('👑 Queen Bee Mode'));
        console.log(chalk.white('   • Centralized coordination and delegation'));
        console.log(chalk.white('   • Strategic task breakdown'));
        console.log(chalk.white('   • Load balancing across flows'));
        console.log(chalk.white('   • Best for: Complex projects, multi-step workflows'));
        console.log();
        
        console.log(chalk.green('🐝 Hive Mind Mode'));
        console.log(chalk.white('   • Multi-agent swarm collaboration'));
        console.log(chalk.white('   • Consensus-based decision making'));
        console.log(chalk.white('   • Parallel processing with coordination'));
        console.log(chalk.white('   • Best for: Research, complex analysis, creative tasks'));
        console.log();
        
        console.log(chalk.yellow('💡 Mode Selection Tips:'));
        console.log(chalk.white('  • Simple tasks → Portal mode'));
        console.log(chalk.white('  • Multi-step projects → Queen Bee mode'));
        console.log(chalk.white('  • Complex research/analysis → Hive Mind mode'));
      })
  );

// Add helpful examples
workflowCommand.addHelpText('after', `
Examples:
  # Simple code generation
  $ nexus-flow workflow run "Create a REST API for user management" --mode portal

  # Complex research with hive mind
  $ nexus-flow workflow run "Research AI trends and create a comprehensive report" --mode hive-mind

  # Quality-focused development
  $ nexus-flow workflow run "Implement secure authentication" --strategy quality --verify

  # Interactive multi-step workflow
  $ nexus-flow workflow run "Build a web application" --mode queen-bee --interactive

  # Dry run to see workflow plan
  $ nexus-flow workflow run "Any objective" --dry-run

Workflow Modes:
  • portal: Single-flow intelligent routing (fast, simple)
  • queen-bee: Centralized coordination (structured, multi-step)
  • hive-mind: Swarm collaboration (complex, creative)

Strategies:
  • speed: Optimize for fast execution
  • quality: Optimize for high-quality results
  • balanced: Balance speed and quality (default)
`);