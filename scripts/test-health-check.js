#!/usr/bin/env node

/**
 * Test Health Check Script
 * Performs comprehensive validation of the test suite health
 */

const { promises: fs } = require('fs');
const path = require('path');

class TestHealthChecker {
  constructor() {
    this.healthChecks = [];
    this.issues = [];
    this.warnings = [];
  }

  async run() {
    console.log('🏥 Nexus Flow Test Suite Health Check\n');
    
    try {
      await this.checkTestStructure();
      await this.checkTestConfiguration();
      await this.checkTestCoverage();
      await this.checkDependencies();
      await this.checkTestData();
      await this.validateTestFiles();
      
      this.generateReport();
      
      const hasIssues = this.issues.length > 0;
      process.exit(hasIssues ? 1 : 0);
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      process.exit(1);
    }
  }

  async checkTestStructure() {
    console.log('📁 Checking test directory structure...');
    
    const expectedDirs = [
      'tests',
      'tests/unit',
      'tests/integration', 
      'tests/e2e',
      'tests/performance',
      'tests/setup',
      'tests/mocks',
      'tests/fixtures',
      'tests/utils'
    ];
    
    const expectedFiles = [
      'tests/setup/jest.setup.ts',
      'tests/setup/global-setup.ts',
      'tests/setup/global-teardown.ts',
      'tests/mocks/mock-flow-adapter.ts',
      'jest.config.js'
    ];
    
    for (const dir of expectedDirs) {
      const exists = await this.pathExists(dir);
      if (!exists) {
        this.issues.push(`Missing test directory: ${dir}`);
      } else {
        this.healthChecks.push(`✅ Directory exists: ${dir}`);
      }
    }
    
    for (const file of expectedFiles) {
      const exists = await this.pathExists(file);
      if (!exists) {
        this.issues.push(`Missing test file: ${file}`);
      } else {
        this.healthChecks.push(`✅ File exists: ${file}`);
      }
    }
    
    console.log('✅ Test structure check completed\n');
  }

  async checkTestConfiguration() {
    console.log('⚙️  Checking test configuration...');
    
    // Check Jest configuration
    try {
      const jestConfigPath = 'jest.config.js';
      const jestConfigExists = await this.pathExists(jestConfigPath);
      
      if (!jestConfigExists) {
        this.issues.push('Missing Jest configuration file');
      } else {
        // Basic validation of Jest config
        const configContent = await fs.readFile(jestConfigPath, 'utf-8');
        
        const requiredConfigs = [
          'preset',
          'testEnvironment',
          'setupFilesAfterEnv',
          'collectCoverage',
          'coverageThreshold'
        ];
        
        for (const config of requiredConfigs) {
          if (!configContent.includes(config)) {
            this.warnings.push(`Jest config missing recommended setting: ${config}`);
          }
        }
        
        this.healthChecks.push('✅ Jest configuration file exists');
      }
    } catch (error) {
      this.issues.push(`Error reading Jest config: ${error.message}`);
    }
    
    // Check package.json test scripts
    try {
      const packageJsonPath = 'package.json';
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      const requiredScripts = [
        'test',
        'test:watch',
        'test:coverage'
      ];
      
      for (const script of requiredScripts) {
        if (!packageJson.scripts || !packageJson.scripts[script]) {
          this.warnings.push(`Missing test script in package.json: ${script}`);
        } else {
          this.healthChecks.push(`✅ Test script exists: ${script}`);
        }
      }
    } catch (error) {
      this.issues.push(`Error reading package.json: ${error.message}`);
    }
    
    console.log('✅ Configuration check completed\n');
  }

  async checkTestCoverage() {
    console.log('📊 Checking test coverage configuration...');
    
    try {
      const jestConfigPath = 'jest.config.js';
      const configContent = await fs.readFile(jestConfigPath, 'utf-8');
      
      // Check for coverage configuration
      if (!configContent.includes('collectCoverage')) {
        this.warnings.push('Coverage collection not configured');
      }
      
      if (!configContent.includes('coverageThreshold')) {
        this.warnings.push('Coverage thresholds not set');
      }
      
      if (!configContent.includes('collectCoverageFrom')) {
        this.warnings.push('Coverage collection patterns not defined');
      }
      
      // Check for coverage exclusions
      if (!configContent.includes('coveragePathIgnorePatterns')) {
        this.warnings.push('Coverage exclusions not configured');
      }
      
      this.healthChecks.push('✅ Coverage configuration checked');
      
    } catch (error) {
      this.issues.push(`Error checking coverage config: ${error.message}`);
    }
    
    console.log('✅ Coverage check completed\n');
  }

  async checkDependencies() {
    console.log('📦 Checking test dependencies...');
    
    try {
      const packageJsonPath = 'package.json';
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      const requiredDevDependencies = [
        'jest',
        'ts-jest',
        '@types/jest',
        '@jest/globals',
        'typescript'
      ];
      
      const optionalDevDependencies = [
        'jest-junit',
        'jest-html-reporters'
      ];
      
      for (const dep of requiredDevDependencies) {
        if (!packageJson.devDependencies || !packageJson.devDependencies[dep]) {
          this.issues.push(`Missing required dev dependency: ${dep}`);
        } else {
          this.healthChecks.push(`✅ Dependency exists: ${dep}`);
        }
      }
      
      for (const dep of optionalDevDependencies) {
        if (!packageJson.devDependencies || !packageJson.devDependencies[dep]) {
          this.warnings.push(`Missing optional dev dependency: ${dep}`);
        } else {
          this.healthChecks.push(`✅ Optional dependency exists: ${dep}`);
        }
      }
      
    } catch (error) {
      this.issues.push(`Error checking dependencies: ${error.message}`);
    }
    
    console.log('✅ Dependencies check completed\n');
  }

  async checkTestData() {
    console.log('🗃️  Checking test fixtures and data...');
    
    const fixturesPaths = [
      'tests/fixtures/configs',
      'tests/fixtures/data'
    ];
    
    for (const fixturePath of fixturesPaths) {
      const exists = await this.pathExists(fixturePath);
      if (!exists) {
        this.warnings.push(`Missing fixtures directory: ${fixturePath}`);
      } else {
        // Check if fixtures directory has content
        try {
          const files = await fs.readdir(fixturePath);
          if (files.length === 0) {
            this.warnings.push(`Empty fixtures directory: ${fixturePath}`);
          } else {
            this.healthChecks.push(`✅ Fixtures directory has content: ${fixturePath}`);
          }
        } catch (error) {
          this.warnings.push(`Cannot read fixtures directory: ${fixturePath}`);
        }
      }
    }
    
    console.log('✅ Test data check completed\n');
  }

  async validateTestFiles() {
    console.log('🔍 Validating test files...');
    
    const testDirs = ['tests/unit', 'tests/integration', 'tests/e2e', 'tests/performance'];
    let totalTestFiles = 0;
    
    for (const testDir of testDirs) {
      const exists = await this.pathExists(testDir);
      if (!exists) {
        continue;
      }
      
      try {
        const files = await this.getTestFiles(testDir);
        totalTestFiles += files.length;
        
        for (const file of files) {
          await this.validateTestFile(file);
        }
        
        if (files.length === 0) {
          this.warnings.push(`No test files found in: ${testDir}`);
        } else {
          this.healthChecks.push(`✅ Found ${files.length} test files in: ${testDir}`);
        }
        
      } catch (error) {
        this.issues.push(`Error reading test directory ${testDir}: ${error.message}`);
      }
    }
    
    if (totalTestFiles === 0) {
      this.issues.push('No test files found in any test directory');
    } else {
      this.healthChecks.push(`✅ Total test files found: ${totalTestFiles}`);
    }
    
    console.log('✅ Test file validation completed\n');
  }

  async getTestFiles(directory) {
    const files = [];
    
    async function scanDirectory(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts'))) {
          files.push(fullPath);
        }
      }
    }
    
    await scanDirectory(directory);
    return files;
  }

  async validateTestFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Basic validation
      if (!content.includes('describe')) {
        this.warnings.push(`Test file missing describe blocks: ${filePath}`);
      }
      
      if (!content.includes('it(')) {
        this.warnings.push(`Test file missing test cases: ${filePath}`);
      }
      
      if (!content.includes('expect')) {
        this.warnings.push(`Test file missing assertions: ${filePath}`);
      }
      
      // Check imports
      if (!content.includes('@jest/globals') && !content.includes('jest')) {
        this.warnings.push(`Test file missing Jest imports: ${filePath}`);
      }
      
      // Check for proper TypeScript usage
      if (!filePath.endsWith('.ts')) {
        this.warnings.push(`Test file not using TypeScript: ${filePath}`);
      }
      
    } catch (error) {
      this.issues.push(`Cannot read test file ${filePath}: ${error.message}`);
    }
  }

  async pathExists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  generateReport() {
    console.log('📋 Test Suite Health Report');
    console.log('='=repeat(50));
    console.log();
    
    // Summary
    console.log('📊 Summary:');
    console.log(`✅ Passed checks: ${this.healthChecks.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);
    console.log(`❌ Issues: ${this.issues.length}`);
    console.log();
    
    // Issues
    if (this.issues.length > 0) {
      console.log('❌ Critical Issues:');
      for (const issue of this.issues) {
        console.log(`   • ${issue}`);
      }
      console.log();
    }
    
    // Warnings
    if (this.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      for (const warning of this.warnings) {
        console.log(`   • ${warning}`);
      }
      console.log();
    }
    
    // Recommendations
    console.log('💡 Recommendations:');
    if (this.issues.length > 0) {
      console.log('   • Fix critical issues before running tests');
      console.log('   • Ensure all required directories and files exist');
      console.log('   • Verify test configuration is complete');
    }
    
    if (this.warnings.length > 0) {
      console.log('   • Address warnings to improve test quality');
      console.log('   • Consider adding missing optional dependencies');
      console.log('   • Review test coverage configuration');
    }
    
    if (this.issues.length === 0 && this.warnings.length === 0) {
      console.log('   • Test suite is healthy! 🎉');
      console.log('   • Consider running a full test suite to verify functionality');
      console.log('   • Keep test files up to date with code changes');
    }
    
    console.log();
    
    // Overall status
    if (this.issues.length === 0) {
      console.log('🎉 Overall Health: GOOD');
      console.log('   Test suite is ready for use!');
    } else {
      console.log('⚠️  Overall Health: NEEDS ATTENTION');
      console.log('   Please address critical issues before proceeding.');
    }
    
    console.log();
  }
}

// Helper function
String.prototype.repeat = function(times) {
  return new Array(times + 1).join(this);
};

// Run if called directly
if (require.main === module) {
  const checker = new TestHealthChecker();
  checker.run().catch(console.error);
}

module.exports = TestHealthChecker;