import { promises as fs } from 'fs';
import { join } from 'path';

export default async function globalSetup() {
  console.log('🔧 Setting up Nexus Flow test environment...\n');
  
  // Create test directories if they don't exist
  const testDirs = [
    'test-results',
    'coverage',
    '.jest-cache',
    'tests/temp',
    'tests/fixtures/configs',
    'tests/fixtures/data',
  ];
  
  for (const dir of testDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory already exists or other error - continue
    }
  }
  
  // Create test configuration files
  await createTestFixtures();
  
  // Setup test database
  await setupTestDatabase();
  
  // Initialize test logging
  console.log('✅ Test environment setup complete');
}

async function createTestFixtures() {
  const fixturesDir = 'tests/fixtures';
  
  // Create sample configuration files
  const sampleConfig = {
    flows: [
      {
        name: 'test-claude-flow',
        type: 'claude-flow',
        enabled: true,
        config: {
          claudeFlowPath: '/usr/local/bin/claude-flow',
          useHiveMind: false,
          maxConcurrentTasks: 2,
          timeout: 30000,
        },
        priority: 1,
        capabilities: ['codeGeneration', 'codeReview', 'research']
      },
      {
        name: 'test-gemini-flow',
        type: 'gemini-flow',
        enabled: true,
        config: {
          geminiFlowPath: '/usr/local/bin/gemini-flow',
          maxConcurrentTasks: 3,
          timeout: 25000,
        },
        priority: 2,
        capabilities: ['analysis', 'documentation', 'testing']
      }
    ],
    queenBee: {
      enabled: true,
      primaryFlow: 'test-claude-flow',
      delegationStrategy: 'capability-based',
      coordination: {
        maxConcurrentTasks: 10,
        taskTimeout: 60000,
        retryPolicy: {
          maxRetries: 3,
          backoffMultiplier: 2,
          initialDelay: 1000
        }
      }
    },
    portal: {
      defaultFlow: 'test-claude-flow',
      autoDetection: true,
      fallbackChain: ['test-claude-flow', 'test-gemini-flow']
    },
    logging: {
      level: 'error',
      console: false
    }
  };
  
  await fs.writeFile(
    join(fixturesDir, 'configs', 'test-config.json'),
    JSON.stringify(sampleConfig, null, 2)
  );
  
  // Create sample task fixtures
  const sampleTasks = [
    {
      id: 'test-task-001',
      description: 'Generate a simple React component',
      type: 'code-generation',
      priority: 1,
      status: 'pending',
      metadata: { complexity: 'low' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'test-task-002',
      description: 'Review the authentication system for security issues',
      type: 'code-review',
      priority: 2,
      status: 'pending',
      metadata: { complexity: 'high' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  
  await fs.writeFile(
    join(fixturesDir, 'data', 'sample-tasks.json'),
    JSON.stringify(sampleTasks, null, 2)
  );
}

async function setupTestDatabase() {
  // Initialize test database if needed
  // This would set up SQLite or other database for testing
  console.log('📦 Test database setup complete');
}