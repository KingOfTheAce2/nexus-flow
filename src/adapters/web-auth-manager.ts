import { EventEmitter } from 'events';
import { FlowAuthConfig } from './base-flow-adapter.js';
import { FlowType } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export interface AuthSession {
  flowType: FlowType;
  isAuthenticated: boolean;
  authUrl?: string;
  sessionData?: any;
  lastAuthTime?: Date;
  expiresAt?: Date;
}

export interface AuthProvider {
  name: string;
  flowType: FlowType;
  authUrl: string;
  loginUrl: string;
  checkAuthStatus: () => Promise<boolean>;
  openAuthFlow: () => Promise<boolean>;
  getSessionInfo?: () => any;
}

export class WebAuthManager extends EventEmitter {
  private logger: Logger;
  private sessions: Map<FlowType, AuthSession> = new Map();
  private authProviders: Map<FlowType, AuthProvider> = new Map();

  constructor() {
    super();
    this.logger = new Logger('WebAuthManager');
    this.initializeBuiltInProviders();
  }

  private initializeBuiltInProviders(): void {
    // Claude AI provider
    this.registerAuthProvider({
      name: 'Claude AI',
      flowType: FlowType.CLAUDE,
      authUrl: 'https://claude.ai',
      loginUrl: 'https://claude.ai/login',
      checkAuthStatus: async () => {
        // In a real implementation, this would check session validity
        // For now, we check environment variables or stored tokens
        return process.env.ANTHROPIC_API_KEY !== undefined;
      },
      openAuthFlow: async () => {
        try {
          const { default: open } = await import('open');
          await open('https://claude.ai/login');
          return true;
        } catch (error) {
          this.logger.error('Failed to open Claude AI auth URL:', error);
          return false;
        }
      },
      getSessionInfo: () => ({
        hasApiKey: !!process.env.ANTHROPIC_API_KEY,
        authMethod: 'web'
      })
    });

    // Google AI Studio provider
    this.registerAuthProvider({
      name: 'Google AI Studio',
      flowType: FlowType.GEMINI,
      authUrl: 'https://aistudio.google.com',
      loginUrl: 'https://aistudio.google.com/apikey',
      checkAuthStatus: async () => {
        return process.env.GOOGLE_AI_API_KEY !== undefined || 
               process.env.GOOGLE_APPLICATION_CREDENTIALS !== undefined;
      },
      openAuthFlow: async () => {
        try {
          const { default: open } = await import('open');
          await open('https://aistudio.google.com/apikey');
          return true;
        } catch (error) {
          this.logger.error('Failed to open Google AI Studio auth URL:', error);
          return false;
        }
      },
      getSessionInfo: () => ({
        hasApiKey: !!process.env.GOOGLE_AI_API_KEY,
        hasCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        authMethod: 'web'
      })
    });

    // Mistral AI provider
    this.registerAuthProvider({
      name: 'Mistral AI',
      flowType: FlowType.MISTRAL,
      authUrl: 'https://chat.mistral.ai',
      loginUrl: 'https://console.mistral.ai/api-keys',
      checkAuthStatus: async () => {
        return process.env.MISTRAL_API_KEY !== undefined;
      },
      openAuthFlow: async () => {
        try {
          const { default: open } = await import('open');
          await open('https://console.mistral.ai/api-keys');
          return true;
        } catch (error) {
          this.logger.error('Failed to open Mistral AI auth URL:', error);
          return false;
        }
      },
      getSessionInfo: () => ({
        hasApiKey: !!process.env.MISTRAL_API_KEY,
        authMethod: 'web'
      })
    });

    // Perplexity AI provider
    this.registerAuthProvider({
      name: 'Perplexity AI',
      flowType: FlowType.PERPLEXITY,
      authUrl: 'https://www.perplexity.ai',
      loginUrl: 'https://www.perplexity.ai/settings/api',
      checkAuthStatus: async () => {
        return process.env.PERPLEXITY_API_KEY !== undefined;
      },
      openAuthFlow: async () => {
        try {
          const { default: open } = await import('open');
          await open('https://www.perplexity.ai/settings/api');
          return true;
        } catch (error) {
          this.logger.error('Failed to open Perplexity AI auth URL:', error);
          return false;
        }
      },
      getSessionInfo: () => ({
        hasApiKey: !!process.env.PERPLEXITY_API_KEY,
        authMethod: 'web'
      })
    });

    // Cohere provider
    this.registerAuthProvider({
      name: 'Cohere',
      flowType: FlowType.COHERE,
      authUrl: 'https://dashboard.cohere.com',
      loginUrl: 'https://dashboard.cohere.com/api-keys',
      checkAuthStatus: async () => {
        return process.env.COHERE_API_KEY !== undefined;
      },
      openAuthFlow: async () => {
        try {
          const { default: open } = await import('open');
          await open('https://dashboard.cohere.com/api-keys');
          return true;
        } catch (error) {
          this.logger.error('Failed to open Cohere auth URL:', error);
          return false;
        }
      },
      getSessionInfo: () => ({
        hasApiKey: !!process.env.COHERE_API_KEY,
        authMethod: 'web'
      })
    });

    this.logger.info(`Initialized ${this.authProviders.size} built-in auth providers`);
  }

  registerAuthProvider(provider: AuthProvider): void {
    this.authProviders.set(provider.flowType, provider);
    this.logger.debug(`Registered auth provider: ${provider.name} for ${provider.flowType}`);
  }

  async authenticateFlow(flowType: FlowType): Promise<boolean> {
    const provider = this.authProviders.get(flowType);
    if (!provider) {
      this.logger.error(`No auth provider found for flow type: ${flowType}`);
      return false;
    }

    this.logger.info(`Starting authentication for ${provider.name}...`);

    try {
      // First check if already authenticated
      const isAuthenticated = await provider.checkAuthStatus();
      
      if (isAuthenticated) {
        this.logger.info(`${provider.name} is already authenticated`);
        this.updateSession(flowType, true, provider);
        return true;
      }

      // Need to authenticate - open auth flow
      this.logger.info(`Opening authentication flow for ${provider.name}...`);
      const authResult = await provider.openAuthFlow();

      if (authResult) {
        // Give user time to complete authentication
        this.logger.info(`Please complete authentication in your browser for ${provider.name}`);
        this.emit('auth-flow-opened', { flowType, provider: provider.name, url: provider.loginUrl });

        // Wait and check authentication status
        await this.waitForAuthentication(provider, flowType);
        
        const finalStatus = await provider.checkAuthStatus();
        this.updateSession(flowType, finalStatus, provider);
        
        if (finalStatus) {
          this.logger.info(`${provider.name} authentication successful`);
          this.emit('auth-success', { flowType, provider: provider.name });
        } else {
          this.logger.warn(`${provider.name} authentication may be incomplete`);
          this.emit('auth-incomplete', { flowType, provider: provider.name });
        }

        return finalStatus;
      } else {
        this.logger.error(`Failed to open authentication flow for ${provider.name}`);
        this.emit('auth-error', { flowType, provider: provider.name, error: 'Failed to open auth flow' });
        return false;
      }

    } catch (error: any) {
      this.logger.error(`Authentication error for ${provider.name}:`, error);
      this.emit('auth-error', { flowType, provider: provider.name, error: error.message });
      return false;
    }
  }

  private async waitForAuthentication(provider: AuthProvider, flowType: FlowType, maxWaitTime = 60000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds

    return new Promise((resolve) => {
      const checkAuth = async () => {
        const elapsed = Date.now() - startTime;
        
        if (elapsed >= maxWaitTime) {
          this.logger.debug(`Authentication check timeout for ${provider.name}`);
          resolve();
          return;
        }

        try {
          const isAuthenticated = await provider.checkAuthStatus();
          if (isAuthenticated) {
            this.logger.debug(`Authentication detected for ${provider.name}`);
            resolve();
            return;
          }
        } catch (error) {
          this.logger.debug(`Auth check error for ${provider.name}:`, error);
        }

        // Continue checking
        setTimeout(checkAuth, checkInterval);
      };

      // Start checking after a brief delay
      setTimeout(checkAuth, checkInterval);
    });
  }

  private updateSession(flowType: FlowType, isAuthenticated: boolean, provider: AuthProvider): void {
    const session: AuthSession = {
      flowType,
      isAuthenticated,
      authUrl: provider.authUrl,
      lastAuthTime: new Date(),
      sessionData: provider.getSessionInfo ? provider.getSessionInfo() : undefined
    };

    this.sessions.set(flowType, session);
    this.emit('session-updated', session);
  }

  async checkAuthenticationStatus(flowType: FlowType): Promise<boolean> {
    const provider = this.authProviders.get(flowType);
    if (!provider) {
      return false;
    }

    try {
      const isAuthenticated = await provider.checkAuthStatus();
      
      // Update session if it exists
      const existingSession = this.sessions.get(flowType);
      if (existingSession) {
        existingSession.isAuthenticated = isAuthenticated;
        this.sessions.set(flowType, existingSession);
      }

      return isAuthenticated;
    } catch (error) {
      this.logger.error(`Error checking auth status for ${flowType}:`, error);
      return false;
    }
  }

  getAuthSession(flowType: FlowType): AuthSession | undefined {
    return this.sessions.get(flowType);
  }

  getAllAuthSessions(): AuthSession[] {
    return Array.from(this.sessions.values());
  }

  getAuthProvider(flowType: FlowType): AuthProvider | undefined {
    return this.authProviders.get(flowType);
  }

  getAllAuthProviders(): AuthProvider[] {
    return Array.from(this.authProviders.values());
  }

  async openAuthUrl(flowType: FlowType): Promise<boolean> {
    const provider = this.authProviders.get(flowType);
    if (!provider) {
      this.logger.error(`No auth provider found for flow type: ${flowType}`);
      return false;
    }

    return await provider.openAuthFlow();
  }

  getAuthUrl(flowType: FlowType): string | undefined {
    const provider = this.authProviders.get(flowType);
    return provider?.loginUrl;
  }

  isFlowAuthenticated(flowType: FlowType): boolean {
    const session = this.sessions.get(flowType);
    return session?.isAuthenticated || false;
  }

  async authenticateAllFlows(): Promise<{ [key in FlowType]?: boolean }> {
    const results: { [key in FlowType]?: boolean } = {};
    
    this.logger.info('Starting authentication for all flows...');

    // Authenticate each flow type
    for (const flowType of this.authProviders.keys()) {
      try {
        results[flowType] = await this.authenticateFlow(flowType);
      } catch (error: any) {
        this.logger.error(`Failed to authenticate ${flowType}:`, error);
        results[flowType] = false;
      }
    }

    const successCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;
    
    this.logger.info(`Authentication complete: ${successCount}/${totalCount} flows authenticated`);
    this.emit('batch-auth-complete', { results, successCount, totalCount });

    return results;
  }

  // Utility method for web-based authentication guidance
  getAuthInstructions(flowType: FlowType): string {
    const provider = this.authProviders.get(flowType);
    if (!provider) {
      return `No authentication provider available for ${flowType}`;
    }

    switch (flowType) {
      case FlowType.CLAUDE:
        return `To authenticate with Claude AI:
1. Visit: ${provider.loginUrl}
2. Sign in with your Anthropic account
3. Ensure you have access to Claude
4. Alternatively, set ANTHROPIC_API_KEY environment variable`;

      case FlowType.GEMINI:
        return `To authenticate with Google AI Studio:
1. Visit: ${provider.loginUrl}
2. Sign in with your Google account
3. Create or copy your API key
4. Set GOOGLE_AI_API_KEY environment variable
5. Or configure Google Application Credentials`;

      case FlowType.MISTRAL:
        return `To authenticate with Mistral AI:
1. Visit: ${provider.loginUrl}
2. Sign in with your Mistral account
3. Create or copy your API key
4. Set MISTRAL_API_KEY environment variable`;

      case FlowType.PERPLEXITY:
        return `To authenticate with Perplexity AI:
1. Visit: ${provider.loginUrl}
2. Sign in with your Perplexity account
3. Create or copy your API key
4. Set PERPLEXITY_API_KEY environment variable
5. Note: Requires paid account for API access`;

      case FlowType.COHERE:
        return `To authenticate with Cohere:
1. Visit: ${provider.loginUrl}
2. Sign in with your Cohere account
3. Create or copy your API key
4. Set COHERE_API_KEY environment variable`;

      default:
        return `Visit ${provider.loginUrl} to authenticate with ${provider.name}`;
    }
  }

  // Clear all sessions (useful for logout)
  clearAllSessions(): void {
    this.sessions.clear();
    this.emit('sessions-cleared');
    this.logger.info('All authentication sessions cleared');
  }

  clearSession(flowType: FlowType): void {
    this.sessions.delete(flowType);
    this.emit('session-cleared', { flowType });
    this.logger.debug(`Authentication session cleared for ${flowType}`);
  }
}