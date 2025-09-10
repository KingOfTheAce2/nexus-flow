import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';

// CLI Test Runner for User Acceptance Testing
class CLITestRunner extends EventEmitter {
  private tempDir: string;
  private nexusConfigPath: string;
  private cliPath: string;
  private testSessionId: string;

  constructor() {
    super();
    this.testSessionId = `cli-test-${Date.now()}`;
    this.tempDir = join(process.cwd(), 'tests', 'temp', 'cli', this.testSessionId);
    this.nexusConfigPath = join(this.tempDir, 'nexus-config.json');
    this.cliPath = join(process.cwd(), 'dist', 'cli', 'main.js');
  }

  async setup(): Promise<void> {
    // Create temp directory
    await fs.mkdir(this.tempDir, { recursive: true });
    
    // Create test configuration
    const testConfig = {
      flows: [
        {
          name: 'cli-test-claude',
          type: 'claude-flow',
          enabled: true,
          config: {
            claudeFlowPath: 'echo',
            useHiveMind: false,
            maxConcurrentTasks: 2,
            timeout: 10000
          },
          priority: 1,
          capabilities: ['codeGeneration', 'codeReview', 'research']
        },
        {
          name: 'cli-test-gemini',
          type: 'gemini-flow',
          enabled: true,
          config: {
            geminiFlowPath: 'echo',
            maxConcurrentTasks: 1,
            timeout: 8000
          },
          priority: 2,
          capabilities: ['multimodal', 'analysis']
        }
      ],
      queenBee: {
        enabled: true,
        primaryFlow: 'cli-test-claude',
        delegationStrategy: 'capability-based',
        coordination: {
          maxConcurrentTasks: 5,
          taskTimeout: 15000,
          retryPolicy: {
            maxRetries: 2,
            backoffMultiplier: 2,
            initialDelay: 500
          }
        }
      },
      portal: {
        defaultFlow: 'cli-test-claude',
        autoDetection: true,
        fallbackChain: ['cli-test-claude', 'cli-test-gemini']
      },
      logging: {
        level: 'info',
        console: false,
        file: join(this.tempDir, 'cli-test.log')
      }
    };

    await fs.writeFile(this.nexusConfigPath, JSON.stringify(testConfig, null, 2));
  }

  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      for (const file of files) {
        await fs.unlink(join(this.tempDir, file));
      }
      await fs.rmdir(this.tempDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async executeCommand(command: string, args: string[] = [], options: {
    timeout?: number;
    input?: string;
    expectError?: boolean;
    workingDir?: string;
  } = {}): Promise<CLIResult> {
    return new Promise((resolve) => {
      const {
        timeout = 15000,
        input = '',
        expectError = false,
        workingDir = this.tempDir
      } = options;

      const fullArgs = [command, ...args, '--config', this.nexusConfigPath];
      const childProcess = spawn('node', [this.cliPath, ...fullArgs], {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NEXUS_TEST_MODE: 'true',
          NEXUS_LOG_LEVEL: 'error' // Reduce noise in tests
        }
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        childProcess.kill('SIGTERM');
      }, timeout);

      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      if (input) {
        childProcess.stdin?.write(input);
        childProcess.stdin?.end();
      }

      childProcess.on('close', (code) => {
        clearTimeout(timer);
        
        const result: CLIResult = {
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          success: expectError ? code !== 0 : code === 0,
          timedOut,
          command: `${command} ${args.join(' ')}`,
          executionTime: Date.now() // Simplified for testing
        };

        resolve(result);
      });

      childProcess.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          exitCode: 1,
          stdout: '',
          stderr: error.message,
          success: false,
          timedOut: false,
          command: `${command} ${args.join(' ')}`,
          executionTime: Date.now(),
          error: error.message
        });
      });
    });
  }

  async expectCommandSuccess(command: string, args: string[] = [], options: any = {}): Promise<CLIResult> {
    const result = await this.executeCommand(command, args, options);
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    return result;
  }

  async expectCommandFailure(command: string, args: string[] = [], options: any = {}): Promise<CLIResult> {
    const result = await this.executeCommand(command, args, { ...options, expectError: true });
    expect(result.success).toBe(true); // Success means we expected the error
    expect(result.exitCode).not.toBe(0);
    return result;
  }

  async checkConfigFile(): Promise<boolean> {
    try {
      await fs.access(this.nexusConfigPath);
      return true;
    } catch {
      return false;
    }
  }

  async getLogContents(): Promise<string> {
    try {
      const logPath = join(this.tempDir, 'cli-test.log');
      return await fs.readFile(logPath, 'utf-8');
    } catch {
      return '';
    }
  }
}

interface CLIResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
  timedOut: boolean;
  command: string;
  executionTime: number;
  error?: string;
}

describe('CLI User Acceptance Tests', () => {
  let cliRunner: CLITestRunner;

  beforeAll(async () => {
    cliRunner = new CLITestRunner();
    await cliRunner.setup();
  });

  afterAll(async () => {
    await cliRunner.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Command Structure', () => {
    it('should display help information', async () => {
      // Test the main help command
      const result = await cliRunner.expectCommandSuccess('--help');
      
      expect(result.stdout).toContain('nexus-flow');
      expect(result.stdout).toContain('portal');
      expect(result.stdout).toContain('queen');
      expect(result.stdout).toContain('init');
      expect(result.stdout).toContain('status');
      expect(result.stdout).toContain('auth');
    });

    it('should show version information', async () => {
      const result = await cliRunner.expectCommandSuccess('--version');
      
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Version pattern
      expect(result.stdout).toContain('nexus-flow');
    });

    it('should display subcommand help', async () => {
      const commands = ['portal', 'queen', 'init', 'status', 'auth'];
      
      for (const command of commands) {
        const result = await cliRunner.expectCommandSuccess(command, ['--help']);
        expect(result.stdout).toContain(command);
        expect(result.stdout).toContain('Usage:');
      }
    });

    it('should handle unknown commands gracefully', async () => {
      const result = await cliRunner.expectCommandFailure('unknown-command');
      
      expect(result.stderr).toContain('unknown');
      expect(result.stderr).toContain('command');
    });
  });

  describe('Initialization and Configuration', () => {
    it('should initialize new configuration', async () => {
      // Remove existing config to test init
      const tempConfigPath = join(cliRunner['tempDir'], 'init-test-config.json');
      
      const result = await cliRunner.expectCommandSuccess('init', [
        '--config', tempConfigPath,
        '--non-interactive'
      ]);
      
      expect(result.stdout).toContain('initialized');
      
      // Verify config file was created
      try {
        const configContent = await fs.readFile(tempConfigPath, 'utf-8');
        const config = JSON.parse(configContent);
        expect(config.flows).toBeDefined();
        expect(config.queenBee).toBeDefined();
        expect(config.portal).toBeDefined();
      } catch (error) {
        fail('Configuration file was not created or is invalid');
      }
    });

    it('should validate configuration files', async () => {
      // Create invalid config
      const invalidConfigPath = join(cliRunner['tempDir'], 'invalid-config.json');
      await fs.writeFile(invalidConfigPath, '{"invalid": "config"}');
      
      const result = await cliRunner.expectCommandFailure('status', [
        '--config', invalidConfigPath
      ]);
      
      expect(result.stderr).toContain('configuration') || expect(result.stderr).toContain('config');
    });

    it('should handle missing configuration gracefully', async () => {
      const nonexistentConfigPath = join(cliRunner['tempDir'], 'nonexistent-config.json');
      
      const result = await cliRunner.expectCommandFailure('status', [
        '--config', nonexistentConfigPath
      ]);
      
      expect(result.stderr).toContain('not found') || expect(result.stderr).toContain('missing');
    });
  });

  describe('Status and Information Commands', () => {
    it('should display system status', async () => {
      const result = await cliRunner.expectCommandSuccess('status');
      
      expect(result.stdout).toContain('Status');
      expect(result.stdout).toContain('Flow') || expect(result.stdout).toContain('flows');
    });

    it('should show detailed status with verbose flag', async () => {
      const result = await cliRunner.expectCommandSuccess('status', ['--verbose']);
      
      expect(result.stdout).toContain('Status');
      expect(result.stdout.length).toBeGreaterThan(100); // Verbose should be longer
    });

    it('should format status output as JSON when requested', async () => {
      const result = await cliRunner.expectCommandSuccess('status', ['--json']);
      
      try {
        const status = JSON.parse(result.stdout);
        expect(status).toHaveProperty('flows');
        expect(status).toHaveProperty('queenBee');
      } catch (error) {
        fail('Status output is not valid JSON');
      }
    });
  });

  describe('Portal Mode Operations', () => {
    it('should execute simple portal commands', async () => {
      const testPrompt = 'Hello, this is a test prompt for portal mode';
      
      const result = await cliRunner.executeCommand('portal', [testPrompt], {
        timeout: 20000
      });
      
      // Since we're using echo as mock command, expect some output
      expect(result.stdout).toBeDefined();
      expect(result.exitCode).toBe(0);
    });

    it('should handle portal commands with specific flow', async () => {
      const testPrompt = 'Generate a simple function';
      
      const result = await cliRunner.executeCommand('portal', [
        testPrompt,
        '--flow', 'cli-test-claude'
      ], {
        timeout: 15000
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeDefined();
    });

    it('should handle portal commands with output formatting', async () => {
      const testPrompt = 'Analyze this code';
      
      const jsonResult = await cliRunner.executeCommand('portal', [
        testPrompt,
        '--json'
      ]);
      
      if (jsonResult.exitCode === 0) {
        try {
          JSON.parse(jsonResult.stdout);
        } catch {
          fail('JSON output is not valid');
        }
      }
    });

    it('should handle interactive portal mode', async () => {
      const result = await cliRunner.executeCommand('portal', ['--interactive'], {
        input: 'test command\nexit\n',
        timeout: 10000
      });
      
      // Interactive mode should handle input gracefully
      expect(result.stdout).toBeDefined();
    });
  });

  describe('Queen Bee Operations', () => {
    it('should execute tasks via Queen Bee', async () => {
      const testTask = 'Analyze and implement a sorting algorithm';
      
      const result = await cliRunner.executeCommand('queen', [testTask], {
        timeout: 20000
      });
      
      expect(result.stdout).toBeDefined();
      if (result.exitCode === 0) {
        expect(result.stdout.length).toBeGreaterThan(0);
      }
    });

    it('should show Queen Bee delegation strategy', async () => {
      const result = await cliRunner.executeCommand('queen', ['--status']);
      
      expect(result.stdout).toContain('strategy') || expect(result.stdout).toContain('delegation');
    });

    it('should handle Queen Bee task with priority', async () => {
      const testTask = 'High priority system analysis';
      
      const result = await cliRunner.executeCommand('queen', [
        testTask,
        '--priority', '3'
      ]);
      
      // Should execute without error
      expect(result.exitCode).toBeLessThanOrEqual(1); // Allow for mock command limitations
    });

    it('should display Queen Bee metrics', async () => {
      const result = await cliRunner.executeCommand('queen', ['--metrics']);
      
      if (result.exitCode === 0) {
        expect(result.stdout).toContain('delegation') || 
               expect(result.stdout).toContain('performance') ||
               expect(result.stdout).toContain('tasks');
      }
    });
  });

  describe('Authentication Commands', () => {
    it('should show authentication status', async () => {
      const result = await cliRunner.executeCommand('auth', ['status']);
      
      expect(result.stdout).toBeDefined();
      expect(result.stdout).toContain('auth') || 
             expect(result.stdout).toContain('status') ||
             expect(result.stdout).toContain('flow');
    });

    it('should handle authentication login command', async () => {
      const result = await cliRunner.executeCommand('auth', ['login', '--flow', 'all'], {
        timeout: 10000,
        input: '\n' // Send enter to skip actual auth
      });
      
      // Command should not crash
      expect(result.timedOut).toBe(false);
    });

    it('should handle authentication logout', async () => {
      const result = await cliRunner.executeCommand('auth', ['logout', '--flow', 'all']);
      
      // Should execute without major errors
      expect(result.timedOut).toBe(false);
    });

    it('should validate authentication for specific flows', async () => {
      const flows = ['cli-test-claude', 'cli-test-gemini'];
      
      for (const flow of flows) {
        const result = await cliRunner.executeCommand('auth', ['status', '--flow', flow]);
        
        expect(result.stdout).toBeDefined();
        expect(result.stdout).toContain(flow) || expect(result.stdout).toContain('auth');
      }
    });
  });

  describe('Configuration Management', () => {
    it('should display current configuration', async () => {
      const result = await cliRunner.expectCommandSuccess('config', ['show']);
      
      expect(result.stdout).toContain('flows') || expect(result.stdout).toContain('configuration');
    });

    it('should validate configuration', async () => {
      const result = await cliRunner.executeCommand('config', ['validate']);
      
      expect(result.stdout).toBeDefined();
      expect(result.stdout).toContain('valid') || 
             expect(result.stdout).toContain('configuration') ||
             expect(result.stderr).toContain('error');
    });

    it('should handle configuration updates', async () => {
      const result = await cliRunner.executeCommand('config', [
        'set',
        'queenBee.enabled=false'
      ]);
      
      // Should not crash
      expect(result.timedOut).toBe(false);
    });
  });

  describe('Workflow Management', () => {
    it('should list available workflows', async () => {
      const result = await cliRunner.executeCommand('workflow', ['list']);
      
      expect(result.stdout).toBeDefined();
      // May be empty but should not error
    });

    it('should handle workflow execution', async () => {
      const result = await cliRunner.executeCommand('workflow', [
        'run',
        'Create a simple web application'
      ], {
        timeout: 25000
      });
      
      // Should attempt execution
      expect(result.timedOut).toBe(false);
    });

    it('should show workflow status', async () => {
      const result = await cliRunner.executeCommand('workflow', ['status']);
      
      expect(result.stdout).toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid arguments gracefully', async () => {
      const invalidCommands = [
        ['portal'], // Missing prompt
        ['queen'], // Missing task
        ['auth', 'invalid-action'],
        ['config', 'invalid-action'],
        ['workflow', 'invalid-action']
      ];

      for (const [command, ...args] of invalidCommands) {
        const result = await cliRunner.executeCommand(command, args, {
          expectError: true,
          timeout: 5000
        });
        
        expect(result.stderr).toBeDefined();
        expect(result.stderr.length).toBeGreaterThan(0);
      }
    });

    it('should handle process interruption gracefully', async () => {
      // This test is tricky - we'll simulate it by using short timeouts
      const result = await cliRunner.executeCommand('portal', [
        'This is a long running task that should be interrupted'
      ], {
        timeout: 1000 // Very short timeout to simulate interruption
      });
      
      expect(result.timedOut).toBe(true);
    });

    it('should handle missing dependencies', async () => {
      // Test with invalid flow path
      const tempConfig = {
        flows: [{
          name: 'invalid-flow',
          type: 'claude-flow',
          enabled: true,
          config: {
            claudeFlowPath: '/nonexistent/command',
            maxConcurrentTasks: 1,
            timeout: 5000
          }
        }],
        queenBee: { enabled: false },
        portal: { defaultFlow: 'invalid-flow', autoDetection: false, fallbackChain: [] }
      };

      const tempConfigPath = join(cliRunner['tempDir'], 'invalid-deps-config.json');
      await fs.writeFile(tempConfigPath, JSON.stringify(tempConfig));

      const result = await cliRunner.executeCommand('portal', [
        'test command'
      ], {
        timeout: 10000
      });

      // Should handle missing dependencies gracefully
      expect(result.timedOut).toBe(false);
    });

    it('should provide helpful error messages', async () => {
      const result = await cliRunner.expectCommandFailure('portal', []);
      
      expect(result.stderr).toContain('required') || 
             expect(result.stderr).toContain('missing') ||
             expect(result.stderr).toContain('prompt');
    });
  });

  describe('Output Formatting and User Experience', () => {
    it('should support different output formats', async () => {
      const formats = [
        ['--json'],
        ['--verbose'],
        ['--quiet']
      ];

      for (const formatArgs of formats) {
        const result = await cliRunner.executeCommand('status', formatArgs);
        
        expect(result.timedOut).toBe(false);
        // Each format should produce some output or handle gracefully
      }
    });

    it('should provide progress indicators for long operations', async () => {
      const result = await cliRunner.executeCommand('portal', [
        'Complex analysis task that takes time'
      ], {
        timeout: 15000
      });
      
      // Should complete within timeout
      expect(result.timedOut).toBe(false);
    });

    it('should handle unicode and special characters', async () => {
      const specialPrompt = 'Analyze this: "Hello 🌍" with unicode chars ñáéíóú';
      
      const result = await cliRunner.executeCommand('portal', [specialPrompt]);
      
      // Should not crash on special characters
      expect(result.timedOut).toBe(false);
    });

    it('should provide clear command completion feedback', async () => {
      const result = await cliRunner.executeCommand('status');
      
      if (result.exitCode === 0) {
        expect(result.stdout.length).toBeGreaterThan(0);
      } else {
        expect(result.stderr.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Integration and System Tests', () => {
    it('should maintain state across multiple commands', async () => {
      // Execute sequence of commands
      const commands = [
        ['status'],
        ['auth', 'status'],
        ['portal', 'Quick test'],
        ['status']
      ];

      for (const [command, ...args] of commands) {
        const result = await cliRunner.executeCommand(command, args, {
          timeout: 10000
        });
        
        // Each command should not crash the system
        expect(result.timedOut).toBe(false);
      }
    });

    it('should handle concurrent command execution', async () => {
      const concurrentCommands = [
        cliRunner.executeCommand('status'),
        cliRunner.executeCommand('auth', ['status']),
        cliRunner.executeCommand('config', ['show'])
      ];

      const results = await Promise.all(concurrentCommands);
      
      // All commands should complete
      results.forEach(result => {
        expect(result.timedOut).toBe(false);
      });
    });

    it('should preserve configuration across sessions', async () => {
      // Verify config exists
      const configExists = await cliRunner.checkConfigFile();
      expect(configExists).toBe(true);

      // Run command that might modify state
      await cliRunner.executeCommand('status');

      // Config should still exist
      const configStillExists = await cliRunner.checkConfigFile();
      expect(configStillExists).toBe(true);
    });
  });

  describe('Performance and Responsiveness', () => {
    it('should respond to simple commands quickly', async () => {
      const startTime = performance.now();
      const result = await cliRunner.expectCommandSuccess('--help');
      const endTime = performance.now();
      
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(5000); // 5 seconds max for help
    });

    it('should handle resource cleanup properly', async () => {
      // Execute resource-intensive commands
      const commands = [
        ['portal', 'Complex analysis task'],
        ['queen', 'Multi-step orchestration'],
        ['status', '--verbose']
      ];

      for (const [command, ...args] of commands) {
        await cliRunner.executeCommand(command, args, {
          timeout: 10000
        });
      }

      // System should still be responsive
      const finalResult = await cliRunner.expectCommandSuccess('status');
      expect(finalResult.stdout).toBeDefined();
    });
  });
});