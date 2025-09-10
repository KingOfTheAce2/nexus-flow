import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ClaudeFlowAdapter } from '../../src/adapters/claude-flow-adapter.js';
import { MockFlowAdapter } from '../mocks/mock-flow-adapter.js';
import { FlowType, FlowStatus } from '../../src/types/index.js';

describe('Adapter Integration Tests - Initialization', () => {
  let testConfigDir: string;
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directories for test
    tempDir = join(process.cwd(), 'tests', 'temp');
    testConfigDir = join(tempDir, 'configs');
    
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(testConfigDir, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup temporary directories
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Mock Adapter Integration', () => {
    let mockAdapter: MockFlowAdapter;

    beforeEach(() => {
      mockAdapter = new MockFlowAdapter({
        name: 'integration-test-mock',
        type: FlowType.CLAUDE,
        version: '1.0.0-integration',
        enabled: true,
        priority: 1,
        maxConcurrentTasks: 2,
        timeout: 10000,
        retryAttempts: 1,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          research: true,
          analysis: true,
          documentation: true,
          testing: true,
          refactoring: true,
          orchestration: false,
          hiveMind: false,
          swarmCoordination: false,
          mcp: false,
          webAuth: false
        },
        simulateDelay: 50,
        simulateErrors: false,
        errorRate: 0,
        authRequired: false
      });
    });

    afterEach(async () => {
      if (mockAdapter) {
        await mockAdapter.shutdown();
      }
    });

    it('should initialize and shutdown adapter lifecycle', async () => {
      // Initial state
      expect(mockAdapter.getStatus()).toBe(FlowStatus.OFFLINE);
      expect(mockAdapter.getCurrentLoad()).toBe(0);

      // Initialize
      await mockAdapter.initialize();
      expect(mockAdapter.getStatus()).toBe(FlowStatus.AVAILABLE);
      expect(mockAdapter.canAcceptTask()).toBe(true);

      // Health check
      const isHealthy = await mockAdapter.checkHealth();
      expect(isHealthy).toBe(true);

      // Shutdown
      await mockAdapter.shutdown();
      expect(mockAdapter.getStatus()).toBe(FlowStatus.OFFLINE);
      expect(mockAdapter.canAcceptTask()).toBe(false);
    });

    it('should handle multiple adapters initialization concurrently', async () => {
      const adapters = Array.from({ length: 3 }, (_, i) => 
        new MockFlowAdapter({
          name: `concurrent-adapter-${i}`,
          type: FlowType.GEMINI,
          version: '1.0.0-concurrent',
          enabled: true,
          priority: i + 1,
          maxConcurrentTasks: 1,
          timeout: 5000,
          retryAttempts: 1,
          capabilities: {
            codeGeneration: true,
            codeReview: true,
            research: true,
            analysis: true,
            documentation: true,
            testing: true,
            refactoring: true,
            orchestration: false,
            hiveMind: false,
            swarmCoordination: false,
            mcp: false,
            webAuth: false
          },
          simulateDelay: 100,
        })
      );

      try {
        // Initialize all adapters concurrently
        await Promise.all(adapters.map(adapter => adapter.initialize()));

        // Verify all are available
        for (const adapter of adapters) {
          expect(adapter.getStatus()).toBe(FlowStatus.AVAILABLE);
          expect(await adapter.checkHealth()).toBe(true);
        }

        // Test concurrent health checks
        const healthResults = await Promise.all(
          adapters.map(adapter => adapter.checkHealth())
        );
        expect(healthResults).toEqual([true, true, true]);

      } finally {
        // Cleanup all adapters
        await Promise.all(adapters.map(adapter => adapter.shutdown()));
      }
    });

    it('should handle adapter initialization failures gracefully', async () => {
      const failingAdapter = new MockFlowAdapter({
        name: 'failing-adapter',
        type: FlowType.CLAUDE,
        version: '1.0.0-fail',
        enabled: true,
        priority: 1,
        maxConcurrentTasks: 1,
        timeout: 1000,
        retryAttempts: 0,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          research: true,
          analysis: true,
          documentation: true,
          testing: true,
          refactoring: true,
          orchestration: false,
          hiveMind: false,
          swarmCoordination: false,
          mcp: false,
          webAuth: false
        },
        simulateErrors: true,
        errorRate: 1.0, // Always fail
      });

      // Mock initialization should still work, but health checks will fail
      await failingAdapter.initialize();
      expect(failingAdapter.getStatus()).toBe(FlowStatus.AVAILABLE);
      
      // Health check should fail due to error simulation
      failingAdapter.setMockStatus(FlowStatus.ERROR);
      const isHealthy = await failingAdapter.checkHealth();
      expect(isHealthy).toBe(false);

      await failingAdapter.shutdown();
    });
  });

  describe('Adapter Authentication Integration', () => {
    let authAdapter: MockFlowAdapter;

    beforeEach(() => {
      authAdapter = new MockFlowAdapter({
        name: 'auth-test-adapter',
        type: FlowType.CLAUDE,
        version: '1.0.0-auth',
        enabled: true,
        priority: 1,
        maxConcurrentTasks: 1,
        timeout: 5000,
        retryAttempts: 1,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          research: true,
          analysis: true,
          documentation: true,
          testing: true,
          refactoring: true,
          orchestration: false,
          hiveMind: false,
          swarmCoordination: false,
          mcp: false,
          webAuth: true
        },
        authRequired: true,
        simulateDelay: 50,
      });
    });

    afterEach(async () => {
      if (authAdapter) {
        await authAdapter.shutdown();
      }
    });

    it('should handle authentication flow integration', async () => {
      await authAdapter.initialize();
      
      // Initially not authenticated
      expect(authAdapter.isAuthenticated()).toBe(false);
      
      // Get auth URL
      const authUrl = authAdapter.getAuthUrl();
      expect(authUrl).toContain('mock-auth.example.com');
      expect(authUrl).toContain('auth-test-adapter');
      
      // Authenticate
      const authResult = await authAdapter.authenticate();
      expect(authResult).toBe(true);
      expect(authAdapter.isAuthenticated()).toBe(true);
      
      // Should be able to execute tasks after auth
      expect(authAdapter.canAcceptTask()).toBe(true);
      
      await authAdapter.shutdown();
    });

    it('should handle authentication persistence across operations', async () => {
      await authAdapter.initialize();
      
      // Authenticate
      await authAdapter.authenticate();
      expect(authAdapter.isAuthenticated()).toBe(true);
      
      // Authentication should persist through health checks
      const healthCheck1 = await authAdapter.checkHealth();
      expect(healthCheck1).toBe(true);
      expect(authAdapter.isAuthenticated()).toBe(true);
      
      // And through capability queries
      const capabilities = authAdapter.getCapabilities();
      expect(capabilities.webAuth).toBe(true);
      expect(authAdapter.isAuthenticated()).toBe(true);
      
      await authAdapter.shutdown();
    });
  });

  describe('Adapter Configuration Integration', () => {
    it('should handle complex configuration scenarios', async () => {
      const complexConfig = {
        name: 'complex-config-adapter',
        type: FlowType.GEMINI,
        version: '1.0.0-complex',
        enabled: true,
        priority: 3,
        maxConcurrentTasks: 5,
        timeout: 60000,
        retryAttempts: 3,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          research: true,
          analysis: true,
          documentation: true,
          testing: true,
          refactoring: true,
          orchestration: true,
          hiveMind: true,
          swarmCoordination: true,
          mcp: true,
          webAuth: true
        },
        authRequired: true,
        simulateDelay: 200,
        simulateErrors: true,
        errorRate: 0.1, // 10% error rate
        authConfig: {
          type: 'web' as const,
          webUrl: 'https://example.com',
          loginUrl: 'https://example.com/login'
        }
      };

      const complexAdapter = new MockFlowAdapter(complexConfig);
      
      try {
        await complexAdapter.initialize();
        expect(complexAdapter.getStatus()).toBe(FlowStatus.AVAILABLE);
        expect(complexAdapter.getMaxLoad()).toBe(5);
        
        // Test authentication
        await complexAdapter.authenticate();
        expect(complexAdapter.isAuthenticated()).toBe(true);
        
        // Test capabilities
        const capabilities = complexAdapter.getCapabilities();
        expect(capabilities.orchestration).toBe(false); // Mock adapter overrides this
        expect(capabilities.hiveMind).toBe(false); // Mock adapter overrides this
        expect(capabilities.webAuth).toBe(true);
        
        // Test health with potential errors
        let healthChecks = 0;
        let successfulChecks = 0;
        
        for (let i = 0; i < 10; i++) {
          healthChecks++;
          const isHealthy = await complexAdapter.checkHealth();
          if (isHealthy) successfulChecks++;
        }
        
        // Should have some successful health checks despite error rate
        expect(successfulChecks).toBeGreaterThan(0);
        expect(healthChecks).toBe(10);
        
      } finally {
        await complexAdapter.shutdown();
      }
    });

    it('should validate configuration constraints during integration', async () => {
      // Test that invalid configurations are caught during actual usage
      const invalidConfigs = [
        { maxConcurrentTasks: 0, expectedError: 'maxConcurrentTasks must be greater than 0' },
        { timeout: 0, expectedError: 'timeout must be greater than 0' },
        { timeout: -1000, expectedError: 'timeout must be greater than 0' },
      ];

      for (const { maxConcurrentTasks, timeout, expectedError } of invalidConfigs) {
        const baseConfig = {
          name: 'invalid-config-adapter',
          type: FlowType.CLAUDE,
          version: '1.0.0-invalid',
          enabled: true,
          priority: 1,
          maxConcurrentTasks: maxConcurrentTasks ?? 1,
          timeout: timeout ?? 30000,
          retryAttempts: 1,
          capabilities: {
            codeGeneration: true,
            codeReview: true,
            research: true,
            analysis: true,
            documentation: true,
            testing: true,
            refactoring: true,
            orchestration: false,
            hiveMind: false,
            swarmCoordination: false,
            mcp: false,
            webAuth: false
          }
        };

        expect(() => new MockFlowAdapter(baseConfig)).toThrow(expectedError);
      }
    });
  });

  describe('Error Recovery Integration', () => {
    it('should recover from transient errors during initialization', async () => {
      const recoveryAdapter = new MockFlowAdapter({
        name: 'recovery-adapter',
        type: FlowType.CLAUDE,
        version: '1.0.0-recovery',
        enabled: true,
        priority: 1,
        maxConcurrentTasks: 1,
        timeout: 5000,
        retryAttempts: 3,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          research: true,
          analysis: true,
          documentation: true,
          testing: true,
          refactoring: true,
          orchestration: false,
          hiveMind: false,
          swarmCoordination: false,
          mcp: false,
          webAuth: false
        },
        simulateDelay: 100,
        simulateErrors: false, // Start stable
      });

      await recoveryAdapter.initialize();
      expect(recoveryAdapter.getStatus()).toBe(FlowStatus.AVAILABLE);

      // Simulate error condition
      recoveryAdapter.setMockStatus(FlowStatus.ERROR);
      expect(recoveryAdapter.getStatus()).toBe(FlowStatus.ERROR);

      // Health check should fail
      let isHealthy = await recoveryAdapter.checkHealth();
      expect(isHealthy).toBe(false);

      // Simulate recovery
      recoveryAdapter.setMockStatus(FlowStatus.AVAILABLE);
      expect(recoveryAdapter.getStatus()).toBe(FlowStatus.AVAILABLE);

      // Health check should now pass
      isHealthy = await recoveryAdapter.checkHealth();
      expect(isHealthy).toBe(true);

      await recoveryAdapter.shutdown();
    });
  });
});