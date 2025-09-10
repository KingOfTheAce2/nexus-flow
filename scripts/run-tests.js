#!/usr/bin/env node

/**
 * Test runner script for Nexus Flow
 * Provides convenient test execution with various options
 */

const { spawn } = require('child_process');
const { promises: fs } = require('fs');
const path = require('path');

class TestRunner {
  constructor() {
    this.testTypes = {
      unit: 'tests/unit/**/*.test.ts',
      integration: 'tests/integration/**/*.test.ts',
      e2e: 'tests/e2e/**/*.test.ts',
      performance: 'tests/performance/**/*.test.ts',
      all: 'tests/**/*.test.ts'
    };
    
    this.defaultConfig = {
      verbose: false,
      coverage: true,
      watch: false,
      parallel: true,
      timeout: 30000,
      retries: 0
    };
  }

  async run() {
    const args = process.argv.slice(2);
    const config = this.parseArgs(args);
    
    console.log('🚀 Starting Nexus Flow Test Runner\n');
    
    try {
      await this.validateEnvironment();
      await this.prepareTestEnvironment();
      
      const results = await this.executeTests(config);
      await this.generateReport(results);
      
      process.exit(results.failed > 0 ? 1 : 0);
    } catch (error) {
      console.error('❌ Test runner failed:', error.message);
      process.exit(1);
    }
  }

  parseArgs(args) {
    const config = { ...this.defaultConfig };
    let testType = 'unit';
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--type':
        case '-t':
          testType = args[++i] || 'unit';
          if (!this.testTypes[testType]) {
            throw new Error(`Invalid test type: ${testType}. Valid types: ${Object.keys(this.testTypes).join(', ')}`);
          }
          break;
        case '--verbose':
        case '-v':
          config.verbose = true;
          break;
        case '--no-coverage':
          config.coverage = false;
          break;
        case '--watch':
        case '-w':
          config.watch = true;
          break;
        case '--timeout':
          config.timeout = parseInt(args[++i]) || config.timeout;
          break;
        case '--retries':
          config.retries = parseInt(args[++i]) || 0;
          break;
        case '--sequential':
          config.parallel = false;
          break;
        case '--help':
        case '-h':
          this.showHelp();
          process.exit(0);
          break;
      }
    }
    
    config.testType = testType;
    config.testPattern = this.testTypes[testType];
    
    return config;
  }

  showHelp() {
    console.log(`
Nexus Flow Test Runner

Usage: node scripts/run-tests.js [options]

Options:
  -t, --type <type>     Test type to run (unit, integration, e2e, performance, all) [default: unit]
  -v, --verbose         Enable verbose output
  --no-coverage         Disable coverage collection
  -w, --watch           Run tests in watch mode
  --timeout <ms>        Test timeout in milliseconds [default: 30000]
  --retries <count>     Number of retries for failed tests [default: 0]
  --sequential          Run tests sequentially instead of in parallel
  -h, --help            Show this help message

Examples:
  node scripts/run-tests.js --type unit --verbose
  node scripts/run-tests.js --type integration --no-coverage
  node scripts/run-tests.js --type e2e --timeout 60000
  node scripts/run-tests.js --type performance --sequential
  node scripts/run-tests.js --type all --coverage
    `);
  }

  async validateEnvironment() {
    console.log('🔍 Validating test environment...');
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required, found ${nodeVersion}`);
    }
    
    // Check if built
    const distExists = await fs.access('dist').then(() => true).catch(() => false);
    if (!distExists) {
      console.log('📦 Building project...');
      await this.runCommand('npm', ['run', 'build']);
    }
    
    // Check test directories
    const testDirs = ['tests/unit', 'tests/integration', 'tests/e2e', 'tests/performance'];
    for (const dir of testDirs) {
      const exists = await fs.access(dir).then(() => true).catch(() => false);
      if (!exists) {
        await fs.mkdir(dir, { recursive: true });
      }
    }
    
    console.log('✅ Environment validated\n');
  }

  async prepareTestEnvironment() {
    console.log('🛠️  Preparing test environment...');
    
    // Clean previous test results
    const resultsDir = 'test-results';
    await fs.rm(resultsDir, { recursive: true, force: true });
    await fs.mkdir(resultsDir, { recursive: true });
    
    // Set environment variables
    process.env.NODE_ENV = 'test';
    process.env.NEXUS_TEST_MODE = 'true';
    process.env.NEXUS_LOG_LEVEL = 'error';
    
    console.log('✅ Test environment prepared\n');
  }

  async executeTests(config) {
    console.log(`🧪 Running ${config.testType} tests...\n`);
    
    const jestArgs = this.buildJestArgs(config);
    
    const startTime = Date.now();
    const result = await this.runCommand('npx', ['jest', ...jestArgs], {
      stdio: 'inherit',
      env: {
        ...process.env,
        FORCE_COLOR: '1' // Enable colors in CI
      }
    });
    const endTime = Date.now();
    
    const duration = endTime - startTime;
    
    console.log(`\n⏱️  Tests completed in ${(duration / 1000).toFixed(2)}s`);
    
    return {
      success: result.code === 0,
      failed: result.code === 0 ? 0 : 1,
      duration,
      testType: config.testType
    };
  }

  buildJestArgs(config) {
    const args = [];
    
    // Test pattern
    args.push('--testMatch', `<rootDir>/${config.testPattern}`);
    
    // Coverage
    if (config.coverage) {
      args.push('--coverage');
      args.push('--coverageDirectory', 'test-results/coverage');
      args.push('--coverageReporters', 'text', 'lcov', 'html');
    }
    
    // Watch mode
    if (config.watch) {
      args.push('--watch');
    }
    
    // Verbose
    if (config.verbose) {
      args.push('--verbose');
    }
    
    // Timeout
    args.push('--testTimeout', config.timeout.toString());
    
    // Parallel execution
    if (!config.parallel) {
      args.push('--runInBand');
    }
    
    // Retries
    if (config.retries > 0) {
      args.push('--testRetries', config.retries.toString());
    }
    
    // Output
    args.push('--reporters', 'default', 'jest-junit');
    
    // Specific configurations based on test type
    switch (config.testType) {
      case 'integration':
        args.push('--testTimeout', '60000');
        break;
      case 'e2e':
        args.push('--testTimeout', '120000');
        args.push('--runInBand'); // E2E tests should run sequentially
        break;
      case 'performance':
        args.push('--testTimeout', '300000');
        args.push('--runInBand');
        break;
    }
    
    return args;
  }

  async generateReport(results) {
    console.log('\n📊 Generating test report...');
    
    const reportData = {
      timestamp: new Date().toISOString(),
      testType: results.testType,
      success: results.success,
      duration: results.duration,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };
    
    // Save report
    const reportPath = path.join('test-results', 'test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
    
    // Generate summary
    const summaryPath = path.join('test-results', 'test-summary.md');
    const summary = this.generateSummaryMarkdown(reportData);
    await fs.writeFile(summaryPath, summary);
    
    console.log(`✅ Report generated: ${reportPath}`);
    console.log(`📄 Summary: ${summaryPath}\n`);
    
    // Print summary
    console.log(summary);
  }

  generateSummaryMarkdown(data) {
    const status = data.success ? '✅ PASSED' : '❌ FAILED';
    const duration = (data.duration / 1000).toFixed(2);
    
    return `# Test Report Summary

## Overview
- **Status**: ${status}
- **Test Type**: ${data.testType}
- **Duration**: ${duration}s
- **Timestamp**: ${data.timestamp}

## Environment
- **Node.js**: ${data.environment.nodeVersion}
- **Platform**: ${data.environment.platform}
- **Architecture**: ${data.environment.arch}

## Results
${data.success ? 'All tests passed successfully! 🎉' : 'Some tests failed. Please check the detailed results above.'}

## Next Steps
${data.success ? 
  '- Tests are ready for deployment\n- Consider running additional test suites if needed' : 
  '- Review failed tests and fix issues\n- Re-run tests after fixes\n- Check test logs for detailed error information'
}
`;
  }

  async runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: 'pipe',
        ...options
      });
      
      let stdout = '';
      let stderr = '';
      
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
          if (options.stdio === 'inherit') {
            process.stdout.write(data);
          }
        });
      }
      
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
          if (options.stdio === 'inherit') {
            process.stderr.write(data);
          }
        });
      }
      
      child.on('close', (code) => {
        resolve({
          code,
          stdout,
          stderr
        });
      });
      
      child.on('error', (error) => {
        reject(error);
      });
    });
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.run().catch(console.error);
}

module.exports = TestRunner;