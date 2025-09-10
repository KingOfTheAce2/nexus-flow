import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WebAuthManager, AuthProvider } from '../../../src/adapters/web-auth-manager.js';
import { FlowType } from '../../../src/types/index.js';

describe('WebAuthManager Integration Tests for New Providers', () => {
  let authManager: WebAuthManager;

  beforeEach(() => {
    authManager = new WebAuthManager();
    // Clear environment variables
    delete process.env.MISTRAL_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
    delete process.env.COHERE_API_KEY;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Provider Registration', () => {
    test('should have all new providers registered', () => {
      const providers = authManager.getAllAuthProviders();
      const providerTypes = providers.map(p => p.flowType);

      expect(providerTypes).toContain(FlowType.MISTRAL);
      expect(providerTypes).toContain(FlowType.PERPLEXITY);
      expect(providerTypes).toContain(FlowType.COHERE);
      expect(providers.length).toBeGreaterThanOrEqual(5); // Original + 3 new ones
    });

    test('should have correct provider configurations', () => {
      const mistralProvider = authManager.getAuthProvider(FlowType.MISTRAL);
      const perplexityProvider = authManager.getAuthProvider(FlowType.PERPLEXITY);
      const cohereProvider = authManager.getAuthProvider(FlowType.COHERE);

      expect(mistralProvider).toBeDefined();
      expect(mistralProvider!.name).toBe('Mistral AI');
      expect(mistralProvider!.loginUrl).toBe('https://console.mistral.ai/api-keys');

      expect(perplexityProvider).toBeDefined();
      expect(perplexityProvider!.name).toBe('Perplexity AI');
      expect(perplexityProvider!.loginUrl).toBe('https://www.perplexity.ai/settings/api');

      expect(cohereProvider).toBeDefined();
      expect(cohereProvider!.name).toBe('Cohere');
      expect(cohereProvider!.loginUrl).toBe('https://dashboard.cohere.com/api-keys');
    });
  });

  describe('Authentication Status Checking', () => {
    test('should check Mistral authentication status', async () => {
      // Without API key
      expect(await authManager.checkAuthenticationStatus(FlowType.MISTRAL)).toBe(false);

      // With API key
      process.env.MISTRAL_API_KEY = 'test-key';
      expect(await authManager.checkAuthenticationStatus(FlowType.MISTRAL)).toBe(true);
    });

    test('should check Perplexity authentication status', async () => {
      // Without API key
      expect(await authManager.checkAuthenticationStatus(FlowType.PERPLEXITY)).toBe(false);

      // With API key
      process.env.PERPLEXITY_API_KEY = 'test-key';
      expect(await authManager.checkAuthenticationStatus(FlowType.PERPLEXITY)).toBe(true);
    });

    test('should check Cohere authentication status', async () => {
      // Without API key
      expect(await authManager.checkAuthenticationStatus(FlowType.COHERE)).toBe(false);

      // With API key
      process.env.COHERE_API_KEY = 'test-key';
      expect(await authManager.checkAuthenticationStatus(FlowType.COHERE)).toBe(true);
    });
  });

  describe('Authentication Instructions', () => {
    test('should provide Mistral authentication instructions', () => {
      const instructions = authManager.getAuthInstructions(FlowType.MISTRAL);
      expect(instructions).toContain('Mistral AI');
      expect(instructions).toContain('console.mistral.ai');
      expect(instructions).toContain('MISTRAL_API_KEY');
    });

    test('should provide Perplexity authentication instructions', () => {
      const instructions = authManager.getAuthInstructions(FlowType.PERPLEXITY);
      expect(instructions).toContain('Perplexity AI');
      expect(instructions).toContain('perplexity.ai');
      expect(instructions).toContain('PERPLEXITY_API_KEY');
      expect(instructions).toContain('paid account');
    });

    test('should provide Cohere authentication instructions', () => {
      const instructions = authManager.getAuthInstructions(FlowType.COHERE);
      expect(instructions).toContain('Cohere');
      expect(instructions).toContain('dashboard.cohere.com');
      expect(instructions).toContain('COHERE_API_KEY');
    });
  });

  describe('Authentication Flow', () => {
    test('should handle Mistral authentication flow', async () => {
      const mockOpen = jest.fn().mockResolvedValue(undefined);
      
      // Mock the open function
      jest.doMock('open', () => ({ default: mockOpen }));
      
      const provider = authManager.getAuthProvider(FlowType.MISTRAL);
      expect(provider).toBeDefined();
      
      if (provider) {
        const result = await provider.openAuthFlow();
        expect(result).toBe(true);
      }
    });

    test('should handle authentication success events', (done) => {
      authManager.on('auth-success', (event) => {
        expect(event.flowType).toBe(FlowType.MISTRAL);
        expect(event.provider).toBe('Mistral AI');
        done();
      });

      // Simulate authentication success
      authManager.emit('auth-success', { 
        flowType: FlowType.MISTRAL, 
        provider: 'Mistral AI' 
      });
    });

    test('should handle authentication errors', (done) => {
      authManager.on('auth-error', (event) => {
        expect(event.flowType).toBe(FlowType.PERPLEXITY);
        expect(event.provider).toBe('Perplexity AI');
        expect(event.error).toContain('Failed');
        done();
      });

      // Simulate authentication error
      authManager.emit('auth-error', { 
        flowType: FlowType.PERPLEXITY, 
        provider: 'Perplexity AI',
        error: 'Failed to authenticate'
      });
    });
  });

  describe('Batch Authentication', () => {
    test('should authenticate all new providers', async () => {
      // Set up environment variables for successful auth
      process.env.MISTRAL_API_KEY = 'test-mistral';
      process.env.PERPLEXITY_API_KEY = 'test-perplexity';
      process.env.COHERE_API_KEY = 'test-cohere';

      const results = await authManager.authenticateAllFlows();
      
      expect(results[FlowType.MISTRAL]).toBe(true);
      expect(results[FlowType.PERPLEXITY]).toBe(true);
      expect(results[FlowType.COHERE]).toBe(true);
    });

    test('should handle mixed authentication results', async () => {
      // Only set some API keys
      process.env.MISTRAL_API_KEY = 'test-mistral';
      // PERPLEXITY_API_KEY not set
      process.env.COHERE_API_KEY = 'test-cohere';

      const results = await authManager.authenticateAllFlows();
      
      expect(results[FlowType.MISTRAL]).toBe(true);
      expect(results[FlowType.PERPLEXITY]).toBe(false);
      expect(results[FlowType.COHERE]).toBe(true);
    });
  });

  describe('Session Management', () => {
    test('should create sessions for authenticated flows', async () => {
      process.env.MISTRAL_API_KEY = 'test-key';
      
      await authManager.authenticateFlow(FlowType.MISTRAL);
      
      const session = authManager.getAuthSession(FlowType.MISTRAL);
      expect(session).toBeDefined();
      expect(session!.flowType).toBe(FlowType.MISTRAL);
      expect(session!.isAuthenticated).toBe(true);
      expect(session!.authUrl).toBe('https://chat.mistral.ai');
    });

    test('should clear individual sessions', () => {
      process.env.COHERE_API_KEY = 'test-key';
      
      // Create a session
      (authManager as any).updateSession(FlowType.COHERE, true, {
        name: 'Cohere',
        flowType: FlowType.COHERE,
        authUrl: 'https://dashboard.cohere.com',
        loginUrl: 'https://dashboard.cohere.com/api-keys',
        checkAuthStatus: async () => true,
        openAuthFlow: async () => true
      });
      
      expect(authManager.getAuthSession(FlowType.COHERE)).toBeDefined();
      
      authManager.clearSession(FlowType.COHERE);
      expect(authManager.getAuthSession(FlowType.COHERE)).toBeUndefined();
    });

    test('should clear all sessions', () => {
      // Create multiple sessions
      process.env.MISTRAL_API_KEY = 'test';
      process.env.PERPLEXITY_API_KEY = 'test';
      process.env.COHERE_API_KEY = 'test';
      
      const providers = authManager.getAllAuthProviders();
      providers.forEach(provider => {
        (authManager as any).updateSession(provider.flowType, true, provider);
      });

      expect(authManager.getAllAuthSessions().length).toBeGreaterThan(0);
      
      authManager.clearAllSessions();
      expect(authManager.getAllAuthSessions().length).toBe(0);
    });
  });

  describe('URL Management', () => {
    test('should return correct auth URLs', () => {
      expect(authManager.getAuthUrl(FlowType.MISTRAL)).toBe('https://console.mistral.ai/api-keys');
      expect(authManager.getAuthUrl(FlowType.PERPLEXITY)).toBe('https://www.perplexity.ai/settings/api');
      expect(authManager.getAuthUrl(FlowType.COHERE)).toBe('https://dashboard.cohere.com/api-keys');
    });

    test('should handle opening auth URLs', async () => {
      const mockOpen = jest.fn().mockResolvedValue(undefined);
      
      // Mock the open function for each provider
      const providers = authManager.getAllAuthProviders();
      for (const provider of providers) {
        if ([FlowType.MISTRAL, FlowType.PERPLEXITY, FlowType.COHERE].includes(provider.flowType)) {
          (provider as any).openAuthFlow = jest.fn().mockResolvedValue(true);
        }
      }

      const mistralResult = await authManager.openAuthUrl(FlowType.MISTRAL);
      const perplexityResult = await authManager.openAuthUrl(FlowType.PERPLEXITY);
      const cohereResult = await authManager.openAuthUrl(FlowType.COHERE);

      expect(mistralResult).toBe(true);
      expect(perplexityResult).toBe(true);
      expect(cohereResult).toBe(true);
    });
  });

  describe('Authentication Status Helpers', () => {
    test('should check flow authentication status', () => {
      // Initially not authenticated
      expect(authManager.isFlowAuthenticated(FlowType.MISTRAL)).toBe(false);
      
      // Set up authentication
      process.env.MISTRAL_API_KEY = 'test-key';
      const provider = authManager.getAuthProvider(FlowType.MISTRAL)!;
      (authManager as any).updateSession(FlowType.MISTRAL, true, provider);
      
      expect(authManager.isFlowAuthenticated(FlowType.MISTRAL)).toBe(true);
    });

    test('should get session info', () => {
      process.env.COHERE_API_KEY = 'test-key';
      const provider = authManager.getAuthProvider(FlowType.COHERE)!;
      
      if (provider.getSessionInfo) {
        const sessionInfo = provider.getSessionInfo();
        expect(sessionInfo.hasApiKey).toBe(true);
        expect(sessionInfo.authMethod).toBe('web');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle missing providers gracefully', () => {
      expect(authManager.getAuthProvider('invalid-flow' as FlowType)).toBeUndefined();
      expect(authManager.getAuthUrl('invalid-flow' as FlowType)).toBeUndefined();
    });

    test('should handle authentication failures', async () => {
      // Mock a provider with failing auth check
      const failingProvider: AuthProvider = {
        name: 'Failing Provider',
        flowType: FlowType.MISTRAL,
        authUrl: 'https://example.com',
        loginUrl: 'https://example.com/login',
        checkAuthStatus: jest.fn().mockRejectedValue(new Error('Auth check failed')),
        openAuthFlow: jest.fn().mockResolvedValue(false)
      };

      authManager.registerAuthProvider(failingProvider);

      const result = await authManager.checkAuthenticationStatus(FlowType.MISTRAL);
      expect(result).toBe(false);
    });

    test('should emit events on batch authentication complete', (done) => {
      authManager.on('batch-auth-complete', (event) => {
        expect(event.results).toBeDefined();
        expect(event.successCount).toBeGreaterThanOrEqual(0);
        expect(event.totalCount).toBeGreaterThan(0);
        done();
      });

      // Trigger batch authentication
      authManager.authenticateAllFlows();
    });
  });

  describe('Integration with Flow Types', () => {
    test('should support all defined flow types', () => {
      const supportedTypes = [
        FlowType.CLAUDE,
        FlowType.GEMINI,
        FlowType.MISTRAL,
        FlowType.PERPLEXITY,
        FlowType.COHERE
      ];

      supportedTypes.forEach(flowType => {
        const provider = authManager.getAuthProvider(flowType);
        expect(provider).toBeDefined();
        expect(provider!.flowType).toBe(flowType);
      });
    });

    test('should handle provider registration validation', () => {
      const testProvider: AuthProvider = {
        name: 'Test Provider',
        flowType: FlowType.MISTRAL,
        authUrl: 'https://test.com',
        loginUrl: 'https://test.com/login',
        checkAuthStatus: async () => false,
        openAuthFlow: async () => true
      };

      // Should replace existing provider
      const beforeCount = authManager.getAllAuthProviders().length;
      authManager.registerAuthProvider(testProvider);
      const afterCount = authManager.getAllAuthProviders().length;

      expect(afterCount).toBe(beforeCount); // Same count, replaced existing
      expect(authManager.getAuthProvider(FlowType.MISTRAL)!.name).toBe('Test Provider');
    });
  });
});