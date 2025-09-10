import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { FlowType } from '../../types/index.js';
import { WebAuthManager } from '../../adapters/web-auth-manager.js';
import { Logger } from '../../utils/logger.js';

export const authCommand = new Command('auth')
  .description('Manage authentication for AI flows')
  .addCommand(
    new Command('login')
      .description('Authenticate with AI providers')
      .option('-f, --flow <type>', 'Specific flow to authenticate (claude, gemini, mistral, perplexity, cohere, all)')
      .option('--list', 'List available authentication providers')
      .action(async (options) => {
        const logger = new Logger('Auth');
        let spinner: any;

        try {
          const authManager = new WebAuthManager();

          if (options.list) {
            console.log(chalk.blue('🔐 Available Authentication Providers\n'));
            
            const providers = authManager.getAllAuthProviders();
            for (const provider of providers) {
              const status = authManager.isFlowAuthenticated(provider.flowType) ? '✅ Authenticated' : '❌ Not authenticated';
              console.log(chalk.white(`${provider.name} (${provider.flowType})`));
              console.log(chalk.gray(`  Status: ${status}`));
              console.log(chalk.gray(`  Auth URL: ${provider.loginUrl}`));
              console.log();
            }
            return;
          }

          console.log(chalk.blue('🔐 Nexus Flow Authentication\n'));

          let flowType = options.flow;

          if (!flowType || flowType === 'all') {
            // Authenticate all flows
            spinner = ora('Initiating authentication for all flows...').start();
            
            const results = await authManager.authenticateAllFlows();
            spinner.stop();

            console.log(chalk.green('🎯 Authentication Results:\n'));
            
            for (const [type, success] of Object.entries(results)) {
              const status = success ? '✅ Success' : '❌ Failed';
              const provider = authManager.getAuthProvider(type as FlowType);
              console.log(chalk.white(`${provider?.name || type}: ${status}`));
            }

            const successCount = Object.values(results).filter(Boolean).length;
            const totalCount = Object.keys(results).length;
            
            console.log(chalk.cyan(`\n📊 Summary: ${successCount}/${totalCount} flows authenticated successfully`));

            if (successCount < totalCount) {
              console.log(chalk.yellow('\n💡 For failed authentications, try:'));
              console.log(chalk.white('  • Manual authentication: nexus-flow auth login --flow <flow-name>'));
              console.log(chalk.white('  • Check provider-specific instructions'));
            }

          } else {
            // Authenticate specific flow
            const normalizedFlow = normalizeFlowType(flowType);
            if (!normalizedFlow) {
              console.error(chalk.red(`❌ Unknown flow type: ${flowType}`));
              console.log(chalk.yellow('Available flows: claude, gemini, mistral, perplexity, cohere'));
              process.exit(1);
            }

            const provider = authManager.getAuthProvider(normalizedFlow);
            if (!provider) {
              console.error(chalk.red(`❌ No authentication provider for: ${flowType}`));
              process.exit(1);
            }

            console.log(chalk.cyan(`Authenticating with ${provider.name}...\n`));

            // Show authentication instructions
            const instructions = authManager.getAuthInstructions(normalizedFlow);
            console.log(chalk.yellow('📋 Authentication Instructions:'));
            console.log(chalk.white(instructions));
            console.log();

            // Ask user if they want to proceed
            const { proceed } = await inquirer.prompt([{
              type: 'confirm',
              name: 'proceed',
              message: 'Open authentication URL in browser?',
              default: true
            }]);

            if (!proceed) {
              console.log(chalk.yellow('Authentication cancelled.'));
              return;
            }

            spinner = ora(`Opening ${provider.name} authentication...`).start();
            
            const success = await authManager.authenticateFlow(normalizedFlow);
            
            if (success) {
              spinner.succeed(`${provider.name} authenticated successfully!`);
              
              // Show session info
              const session = authManager.getAuthSession(normalizedFlow);
              if (session?.sessionData) {
                console.log(chalk.green('\n✅ Authentication Details:'));
                console.log(chalk.white(`  Provider: ${provider.name}`));
                console.log(chalk.white(`  Status: Authenticated`));
                console.log(chalk.white(`  Auth time: ${session.lastAuthTime?.toLocaleString()}`));
              }
            } else {
              spinner.fail(`${provider.name} authentication failed`);
              console.log(chalk.red('\n❌ Authentication was not completed.'));
              console.log(chalk.yellow('\n💡 Troubleshooting:'));
              console.log(chalk.white('  • Ensure you completed the login process in your browser'));
              console.log(chalk.white('  • Check your internet connection'));
              console.log(chalk.white('  • Try again with: nexus-flow auth login --flow ' + flowType));
            }
          }

        } catch (error: any) {
          if (spinner) {
            spinner.fail('Authentication failed');
          }
          
          console.error(chalk.red('\n❌ Authentication error:'));
          console.error(chalk.red(error.message));
          
          if (error.message.includes('Failed to open')) {
            console.log(chalk.yellow('\n💡 Try manually visiting the authentication URL:'));
            const authManager = new WebAuthManager();
            const flowType = normalizeFlowType(options.flow);
            if (flowType) {
              const authUrl = authManager.getAuthUrl(flowType);
              if (authUrl) {
                console.log(chalk.white(`  ${authUrl}`));
              }
            }
          }
          
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('status')
      .description('Check authentication status for all flows')
      .action(async () => {
        const authManager = new WebAuthManager();
        
        console.log(chalk.blue('🔐 Authentication Status\n'));
        
        const sessions = authManager.getAllAuthSessions();
        const providers = authManager.getAllAuthProviders();
        
        for (const provider of providers) {
          const session = authManager.getAuthSession(provider.flowType);
          const isAuthenticated = authManager.isFlowAuthenticated(provider.flowType);
          
          const status = isAuthenticated ? '✅ Authenticated' : '❌ Not authenticated';
          const icon = isAuthenticated ? '🟢' : '🔴';
          
          console.log(chalk.white(`${icon} ${provider.name} (${provider.flowType})`));
          console.log(chalk.gray(`   Status: ${status}`));
          
          if (session && session.lastAuthTime) {
            console.log(chalk.gray(`   Last auth: ${session.lastAuthTime.toLocaleString()}`));
          }
          
          if (session && session.sessionData) {
            const data = session.sessionData;
            if (data.hasApiKey) {
              console.log(chalk.gray('   Method: API Key'));
            } else if (data.hasCredentials) {
              console.log(chalk.gray('   Method: Service Account'));
            } else {
              console.log(chalk.gray('   Method: Web Authentication'));
            }
          }
          
          console.log();
        }
        
        const authenticatedCount = providers.filter(p => 
          authManager.isFlowAuthenticated(p.flowType)
        ).length;
        
        console.log(chalk.cyan(`📊 Summary: ${authenticatedCount}/${providers.length} flows authenticated`));
        
        if (authenticatedCount < providers.length) {
          console.log(chalk.yellow('\n💡 To authenticate remaining flows:'));
          console.log(chalk.white('  nexus-flow auth login --flow all'));
        }
      })
  )
  .addCommand(
    new Command('logout')
      .description('Clear authentication sessions')
      .option('-f, --flow <type>', 'Specific flow to logout (claude, gemini, mistral, perplexity, cohere, all)')
      .action(async (options) => {
        const authManager = new WebAuthManager();
        
        if (!options.flow || options.flow === 'all') {
          const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Clear all authentication sessions?',
            default: false
          }]);
          
          if (confirm) {
            authManager.clearAllSessions();
            console.log(chalk.green('✅ All authentication sessions cleared'));
          } else {
            console.log(chalk.yellow('Logout cancelled'));
          }
        } else {
          const flowType = normalizeFlowType(options.flow);
          if (flowType) {
            authManager.clearSession(flowType);
            console.log(chalk.green(`✅ ${flowType} authentication session cleared`));
          } else {
            console.error(chalk.red(`❌ Unknown flow type: ${options.flow}`));
          }
        }
      })
  );

function normalizeFlowType(flowType: string): FlowType | null {
  const normalized = flowType.toLowerCase();
  switch (normalized) {
    case 'claude':
    case 'claude-flow':
      return FlowType.CLAUDE;
    case 'gemini':
    case 'gemini-flow':
      return FlowType.GEMINI;
    case 'mistral':
    case 'mistral-flow':
      return FlowType.MISTRAL;
    case 'perplexity':
    case 'perplexity-flow':
      return FlowType.PERPLEXITY;
    case 'cohere':
    case 'cohere-flow':
      return FlowType.COHERE;
    case 'qwen':
    case 'qwen-flow':
      return FlowType.QWEN;
    case 'deepseek':
    case 'deepseek-flow':
      return FlowType.DEEPSEEK;
    default:
      return null;
  }
}

// Add helpful examples
authCommand.addHelpText('after', `
Examples:
  $ nexus-flow auth login --flow claude      # Authenticate with Claude AI
  $ nexus-flow auth login --flow gemini      # Authenticate with Google AI Studio
  $ nexus-flow auth login --flow mistral     # Authenticate with Mistral AI
  $ nexus-flow auth login --flow perplexity  # Authenticate with Perplexity AI
  $ nexus-flow auth login --flow cohere      # Authenticate with Cohere
  $ nexus-flow auth login --flow all         # Authenticate with all providers
  $ nexus-flow auth status                   # Check authentication status
  $ nexus-flow auth logout --flow claude     # Clear Claude authentication
  $ nexus-flow auth --list                   # List all auth providers

Authentication Methods:
  • Claude AI: Web authentication via claude.ai
  • Google AI Studio: API key via aistudio.google.com
  • Mistral AI: API key via console.mistral.ai
  • Perplexity AI: API key via perplexity.ai (paid account required)
  • Cohere: API key via dashboard.cohere.com
  
Environment Variables:
  ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY, MISTRAL_API_KEY, PERPLEXITY_API_KEY, COHERE_API_KEY
`);