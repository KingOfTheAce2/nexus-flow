// Core exports
export { NexusEngine } from './core/nexus-engine.js';
export { ConfigManager } from './core/config-manager.js';
export { FlowRegistry } from './core/flow-registry.js';
export { QueenBee } from './core/queen-bee.js';
export { Portal } from './core/portal.js';
export { WorkflowEngine } from './core/workflow-engine.js';

// Types
export * from './types/index.js';

// Utilities
export { Logger } from './utils/logger.js';

// Adapters
export * from './adapters/index.js';

// CLI (for programmatic usage)
export { initCommand } from './cli/commands/init.js';
export { portalCommand } from './cli/commands/portal.js';
export { queenCommand } from './cli/commands/queen.js';
export { hiveMindCommand } from './cli/commands/hive-mind.js';
export { authCommand } from './cli/commands/auth.js';
export { workflowCommand } from './cli/commands/workflow.js';
export { configCommand } from './cli/commands/config.js';
export { statusCommand } from './cli/commands/status.js';

// Main CLI program
export { default as program } from './cli/main.js';