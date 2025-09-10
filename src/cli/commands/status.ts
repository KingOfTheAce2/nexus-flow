import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { NexusEngine } from '../../core/nexus-engine.js';
import { ConfigManager } from '../../core/config-manager.js';
import { existsSync } from 'fs';

export const statusCommand = new Command('status')
  .description('Show system status and health information')
  .option('--detailed', 'Show detailed information for each flow')
  .option('--discover', 'Discover and show all available flows on system')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    try {
      if (options.json) {
        await showStatusJSON(options);
      } else {
        await showStatusHuman(options);
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to get status:'), error.message);
      process.exit(1);
    }
  });

async function showStatusHuman(options: any): Promise<void> {
  console.log(chalk.blue('🔍 Nexus Flow System Status\n'));

  // Check configuration
  const configManager = new ConfigManager();
  const configPath = configManager.getConfigPath();
  
  if (!existsSync(configPath)) {
    console.log(chalk.red('❌ Configuration not found'));
    console.log(chalk.yellow('💡 Run "nexus-flow init" to initialize configuration'));
    return;
  }

  console.log(chalk.green('✅ Configuration found'));
  console.log(chalk.gray(`   Path: ${configPath}`));

  let spinner = ora('Loading configuration...').start();
  
  try {
    await configManager.load();
    const config = configManager.getConfig();
    spinner.succeed('Configuration loaded');

    // Show basic config info
    const enabledFlows = config.flows.filter(f => f.enabled);
    console.log(chalk.white(`   Flows configured: ${config.flows.length} (${enabledFlows.length} enabled)`));
    console.log(chalk.white(`   Queen Bee: ${config.queenBee?.enabled ? '✅ Enabled' : '❌ Disabled'}`));
    console.log(chalk.white(`   Portal: ${config.portal ? '✅ Configured' : '❌ Not configured'}`));
    console.log();

    // Initialize engine to check flows
    spinner = ora('Initializing Nexus Engine...').start();
    const engine = new NexusEngine();
    await engine.initialize();
    spinner.succeed('Engine initialized');

    const systemStatus = await engine.getSystemStatus();
    const flows = engine.getAvailableFlows();

    // System overview
    console.log(chalk.cyan('🖥️ System Overview:'));
    console.log(chalk.white(`   Engine Status: ${systemStatus.initialized ? '✅ Running' : '❌ Not initialized'}`));
    console.log(chalk.white(`   Queen Bee Mode: ${systemStatus.queenBeeEnabled ? '👑 Active' : '🌐 Portal Mode'}`));
    console.log(chalk.white(`   Available Flows: ${systemStatus.availableFlows}`));
    console.log(chalk.white(`   Active Flows: ${systemStatus.activeFlows}`));
    console.log();

    // Flow status
    console.log(chalk.cyan('🔗 Flow Status:'));
    if (flows.length === 0) {
      console.log(chalk.yellow('   ⚠️ No flows available'));
    } else {
      flows.forEach(flow => {
        let statusIcon = '❌';
        let statusColor = chalk.red;
        
        switch (flow.status) {
          case 'available':
            statusIcon = '✅';
            statusColor = chalk.green;
            break;
          case 'busy':
            statusIcon = '⏳';
            statusColor = chalk.yellow;
            break;
          case 'error':
            statusIcon = '❌';
            statusColor = chalk.red;
            break;
          case 'offline':
            statusIcon = '⚫';
            statusColor = chalk.gray;
            break;
        }

        console.log(chalk.white(`   ${statusIcon} ${flow.name} (${flow.type})`));
        
        if (options.detailed) {
          console.log(chalk.gray(`      Status: ${statusColor(flow.status)}`));
          console.log(chalk.gray(`      Load: ${flow.currentLoad}/${flow.maxLoad}`));
          console.log(chalk.gray(`      Capabilities: ${flow.capabilities.join(', ')}`));
          console.log(chalk.gray(`      Last Activity: ${flow.lastActivity.toLocaleString()}`));
        } else {
          const load = flow.maxLoad > 0 ? `${flow.currentLoad}/${flow.maxLoad}` : 'N/A';
          console.log(chalk.gray(`      Load: ${load} | Capabilities: ${flow.capabilities.slice(0, 3).join(', ')}`));
        }
      });
    }

    if (options.discover) {
      console.log();
      spinner = ora('Discovering flows on system...').start();
      
      const discoveredFlows = await engine.discoverFlows();
      spinner.succeed(`Discovered ${discoveredFlows.length} flows`);
      
      if (discoveredFlows.length > flows.length) {
        const newFlows = discoveredFlows.filter(df => 
          !flows.some(f => f.name === df.name)
        );
        
        console.log(chalk.cyan('🔍 Newly Discovered Flows:'));
        newFlows.forEach(flow => {
          console.log(chalk.white(`   ✨ ${flow.name} (${flow.type})`));
          console.log(chalk.gray(`      Capabilities: ${flow.capabilities.join(', ')}`));
        });
        
        console.log();
        console.log(chalk.yellow('💡 Add these flows to your configuration with "nexus-flow config edit"'));
      }
    }

    // Performance hints
    console.log();
    console.log(chalk.cyan('💡 Performance Recommendations:'));
    
    const recommendations = [];
    
    if (systemStatus.availableFlows === 0) {
      recommendations.push('No flows are available - check your configuration and flow installations');
    } else if (systemStatus.availableFlows === 1) {
      recommendations.push('Consider adding more flows for better task distribution');
    }
    
    if (!systemStatus.queenBeeEnabled && systemStatus.availableFlows > 1) {
      recommendations.push('Enable Queen Bee mode for intelligent task coordination');
    }
    
    const busyFlows = flows.filter(f => f.status === 'busy');
    if (busyFlows.length > systemStatus.activeFlows * 0.7) {
      recommendations.push('High flow utilization - consider adding more flows or increasing capacity');
    }
    
    const errorFlows = flows.filter(f => f.status === 'error');
    if (errorFlows.length > 0) {
      recommendations.push(`${errorFlows.length} flows have errors - check logs and configuration`);
    }

    if (recommendations.length === 0) {
      console.log(chalk.green('   ✅ System is operating optimally'));
    } else {
      recommendations.forEach(rec => {
        console.log(chalk.yellow(`   • ${rec}`));
      });
    }

    await engine.shutdown();

  } catch (error: any) {
    spinner?.fail('Failed to get system status');
    throw error;
  }
}

async function showStatusJSON(options: any): Promise<void> {
  const configManager = new ConfigManager();
  
  const result: any = {
    timestamp: new Date().toISOString(),
    configurationFound: existsSync(configManager.getConfigPath()),
    configurationPath: configManager.getConfigPath()
  };

  if (!result.configurationFound) {
    result.error = 'Configuration not found';
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  try {
    await configManager.load();
    const config = configManager.getConfig();
    
    result.configuration = {
      flowsConfigured: config.flows.length,
      flowsEnabled: config.flows.filter(f => f.enabled).length,
      queenBeeEnabled: config.queenBee?.enabled || false,
      portalConfigured: !!config.portal
    };

    const engine = new NexusEngine();
    await engine.initialize();
    
    const systemStatus = await engine.getSystemStatus();
    const flows = engine.getAvailableFlows();

    result.system = systemStatus;
    result.flows = flows.map(flow => ({
      name: flow.name,
      type: flow.type,
      status: flow.status,
      currentLoad: flow.currentLoad,
      maxLoad: flow.maxLoad,
      capabilities: flow.capabilities,
      lastActivity: flow.lastActivity.toISOString()
    }));

    if (options.discover) {
      const discoveredFlows = await engine.discoverFlows();
      result.discovered = discoveredFlows.map(flow => ({
        name: flow.name,
        type: flow.type,
        capabilities: flow.capabilities
      }));
    }

    await engine.shutdown();
    
  } catch (error: any) {
    result.error = error.message;
  }

  console.log(JSON.stringify(result, null, 2));
}