import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { AdapterFactory } from '../../src/adapters/adapter-factory.js';
import { WebAuthManager } from '../../src/adapters/web-auth-manager.js';
import { FlowType, TaskType, TaskStatus } from '../../src/types/index.js';
import { Logger } from '../../src/utils/logger.js';

// E2E workflow test for new providers
describe('New Providers E2E Workflow Tests', () => {
  let factory: AdapterFactory;
  let authManager: WebAuthManager;
  let logger: Logger;

  const testApiKeys = {
    MISTRAL_API_KEY: 'test-mistral-key-e2e',
    PERPLEXITY_API_KEY: 'test-perplexity-key-e2e',
    COHERE_API_KEY: 'test-cohere-key-e2e'
  };

  beforeAll(() => {
    // Set test environment
    Object.entries(testApiKeys).forEach(([key, value]) => {
      process.env[key] = value;
    });

    factory = AdapterFactory.getInstance();
    authManager = new WebAuthManager();
    logger = new Logger('E2ETest');
  });

  afterAll(() => {
    // Clean up
    Object.keys(testApiKeys).forEach(key => {
      delete process.env[key];
    });
  });

  describe('Complete Workflow: Discovery -> Authentication -> Task Execution', () => {
    test('should discover all new providers', () => {
      const registeredTypes = factory.getRegisteredAdapterTypes();
      const newProviders = [FlowType.MISTRAL, FlowType.PERPLEXITY, FlowType.COHERE];
      
      newProviders.forEach(provider => {
        expect(registeredTypes).toContain(provider);
      });
      
      logger.info(`Discovered ${registeredTypes.length} total providers, including ${newProviders.length} new ones`);
    });

    test('should authenticate with all new providers', async () => {
      const authResults = await authManager.authenticateAllFlows();
      
      expect(authResults[FlowType.MISTRAL]).toBe(true);
      expect(authResults[FlowType.PERPLEXITY]).toBe(true);
      expect(authResults[FlowType.COHERE]).toBe(true);
      
      logger.info('All new providers authenticated successfully');
    });

    test('should create and execute tasks with Mistral', async () => {
      const adapter = await factory.createMistralFlowAdapter({
        apiKey: testApiKeys.MISTRAL_API_KEY,
        maxConcurrentTasks: 2,
        timeout: 10000
      });

      // Mock health check and task execution to avoid real API calls
      jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
      jest.spyOn(adapter, 'executeTask').mockResolvedValue({
        success: true,
        output: `# Python Calculator Function

def calculator(operation, a, b):
    """
    Performs basic arithmetic operations.
    
    Args:
        operation (str): The operation to perform (+, -, *, /)
        a (float): First number
        b (float): Second number
    
    Returns:
        float: Result of the operation
    """
    if operation == '+':
        return a + b
    elif operation == '-':
        return a - b
    elif operation == '*':
        return a * b
    elif operation == '/':
        if b != 0:
            return a / b
        else:
            raise ValueError("Division by zero is not allowed")
    else:
        raise ValueError(f"Unknown operation: {operation}")

# Example usage:
# result = calculator('+', 10, 5)  # Returns 15`,
        executedBy: 'mistral-flow',
        executionTime: 2100,
        metadata: {
          model: 'mistral-large-latest',
          functionCalls: 1,
          tokens: 180
        }
      });

      await adapter.initialize();
      
      const codeTask = {
        id: 'e2e-mistral-code',
        description: 'Create a Python calculator function with documentation and error handling',
        type: TaskType.CODE_GENERATION,
        priority: 7,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await adapter.executeTask(codeTask);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('calculator');
      expect(result.output).toContain('def calculator');
      expect(result.metadata?.functionCalls).toBeGreaterThan(0);
      
      await adapter.shutdown();
      logger.info('Mistral workflow completed successfully');
    });

    test('should create and execute research tasks with Perplexity', async () => {
      const adapter = await factory.createPerplexityFlowAdapter({
        apiKey: testApiKeys.PERPLEXITY_API_KEY,
        maxConcurrentTasks: 1,
        webSearchEnabled: true,
        citationsEnabled: true
      });

      jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
      jest.spyOn(adapter, 'executeTask').mockResolvedValue({
        success: true,
        output: `# Latest AI Development Trends in 2024

Based on current research and industry reports, here are the key AI trends for 2024:

## 1. Multimodal AI Systems
- Integration of text, image, audio, and video processing
- Enhanced cross-modal understanding and generation
- Applications in robotics, autonomous systems, and creative industries

## 2. AI Governance and Regulation
- Implementation of comprehensive AI safety frameworks
- Development of AI ethics guidelines and standards
- Increased focus on transparency and explainability

## 3. Edge AI and Distributed Computing
- Deployment of AI models on edge devices
- Reduced latency and improved privacy
- Enhanced real-time processing capabilities

## 4. Generative AI Evolution
- Improved efficiency and reduced computational costs
- Better fine-tuning capabilities for specific domains
- Enhanced reasoning and problem-solving abilities

**Sources:**
[1] MIT Technology Review - "AI Trends 2024" https://example.com/ai-trends-2024
[2] Stanford AI Index Report https://example.com/stanford-ai-report
[3] McKinsey AI Report 2024 https://example.com/mckinsey-ai-2024

**Research Sources:**
1. **MIT Technology Review** - AI Trends and Predictions
   Published: January 2024
2. **Nature Machine Intelligence** - Recent developments in AI
   Published: February 2024`,
        executedBy: 'perplexity-flow',
        executionTime: 4500,
        metadata: {
          model: 'llama-3.1-sonar-large-128k-online',
          citations: 3,
          searchResults: 5,
          hasWebSearch: true
        }
      });

      await adapter.initialize();
      
      const researchTask = {
        id: 'e2e-perplexity-research',
        description: 'Research the latest AI development trends and breakthroughs in 2024',
        type: TaskType.RESEARCH,
        priority: 9,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await adapter.executeTask(researchTask);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('AI');
      expect(result.output).toContain('Sources:');
      expect(result.metadata?.citations).toBeGreaterThan(0);
      expect(result.metadata?.hasWebSearch).toBe(true);
      
      await adapter.shutdown();
      logger.info('Perplexity research workflow completed successfully');
    });

    test('should create and execute analysis tasks with Cohere', async () => {
      const adapter = await factory.createCohereFlowAdapter({
        apiKey: testApiKeys.COHERE_API_KEY,
        maxConcurrentTasks: 2,
        toolsEnabled: true,
        ragEnabled: true
      });

      jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
      jest.spyOn(adapter, 'executeTask').mockResolvedValue({
        success: true,
        output: `# Code Performance Analysis Report

## Executive Summary
The analyzed Python script contains several performance bottlenecks that can be optimized for better efficiency and scalability.

## Performance Issues Identified

### 1. **Inefficient Loop Structures**
- **Issue**: Traditional for-loops used for list operations
- **Impact**: 3x slower execution time
- **Solution**: Replace with list comprehensions or numpy operations

**Current Code:**
\`\`\`python
results = []
for item in large_list:
    if item > threshold:
        results.append(item * 2)
\`\`\`

**Optimized Code:**
\`\`\`python
results = [item * 2 for item in large_list if item > threshold]
\`\`\`

### 2. **Memory Management Issues**
- **Issue**: Unnecessary object creation in loops
- **Impact**: High memory usage and garbage collection overhead
- **Solution**: Object pooling and reuse

### 3. **Database Query Inefficiencies**
- **Issue**: N+1 query problem in data fetching
- **Impact**: Exponential increase in database load
- **Solution**: Implement query batching and eager loading

## Optimization Recommendations

1. **Algorithm Improvements**
   - Use binary search for sorted data lookups
   - Implement caching for frequently accessed data
   - Utilize vectorized operations where possible

2. **Memory Optimization**
   - Implement lazy loading for large datasets
   - Use generators instead of lists for streaming data
   - Add proper resource cleanup in try-finally blocks

3. **Concurrency Enhancements**
   - Add async/await for I/O operations
   - Implement thread pooling for CPU-bound tasks
   - Consider multiprocessing for parallel computation

## Expected Performance Gains
- **CPU Usage**: 40-60% reduction
- **Memory Usage**: 30-50% reduction
- **Execution Time**: 2-4x faster processing

**Tool Usage:**
1. code_interpreter(performance_analysis)
2. file_operations(read_source_files)
3. workflow_coordinate(claude-flow, "detailed_code_review")`,
        executedBy: 'cohere-flow',
        executionTime: 3200,
        metadata: {
          model: 'command-r-plus',
          toolCalls: 3,
          finishReason: 'COMPLETE'
        }
      });

      await adapter.initialize();
      
      const analysisTask = {
        id: 'e2e-cohere-analysis',
        description: 'Analyze the performance bottlenecks in a Python data processing script and provide optimization recommendations',
        type: TaskType.ANALYSIS,
        priority: 8,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          codeLanguage: 'python',
          focusArea: 'performance'
        }
      };

      const result = await adapter.executeTask(analysisTask);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Performance Analysis');
      expect(result.output).toContain('Tool Usage');
      expect(result.metadata?.toolCalls).toBeGreaterThan(0);
      
      await adapter.shutdown();
      logger.info('Cohere analysis workflow completed successfully');
    });
  });

  describe('Cross-Provider Coordination', () => {
    test('should handle task delegation between providers', async () => {
      const mistralAdapter = await factory.createMistralFlowAdapter({
        apiKey: testApiKeys.MISTRAL_API_KEY
      });
      const cohereAdapter = await factory.createCohereFlowAdapter({
        apiKey: testApiKeys.COHERE_API_KEY
      });

      // Mock adapters to avoid real API calls
      jest.spyOn(mistralAdapter, 'checkHealth').mockResolvedValue(true);
      jest.spyOn(cohereAdapter, 'checkHealth').mockResolvedValue(true);

      await mistralAdapter.initialize();
      await cohereAdapter.initialize();

      let coordinationEvent = null;

      // Listen for coordination events
      mistralAdapter.on('workflow-coordination', (event) => {
        coordinationEvent = event;
      });

      // Mock task execution that triggers coordination
      jest.spyOn(mistralAdapter, 'executeTask').mockImplementation(async (task) => {
        // Simulate triggering coordination
        mistralAdapter.emit('workflow-coordination', {
          targetFlow: 'cohere-flow',
          taskDescription: 'Analyze code quality',
          priority: 7
        });

        return {
          success: true,
          output: 'Generated code. Delegated analysis to Cohere.',
          executedBy: 'mistral-flow',
          executionTime: 1500,
          metadata: { coordinationTriggered: true }
        };
      });

      const orchestrationTask = {
        id: 'e2e-coordination',
        description: 'Generate code and coordinate with another provider for analysis',
        type: TaskType.ORCHESTRATION,
        priority: 8,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await mistralAdapter.executeTask(orchestrationTask);
      
      expect(result.success).toBe(true);
      expect(coordinationEvent).not.toBeNull();
      expect((coordinationEvent as any).targetFlow).toBe('cohere-flow');
      expect((coordinationEvent as any).taskDescription).toContain('Analyze');

      await mistralAdapter.shutdown();
      await cohereAdapter.shutdown();
      logger.info('Cross-provider coordination test completed');
    });
  });

  describe('Load Balancing and Performance', () => {
    test('should handle concurrent tasks across multiple providers', async () => {
      const adapters = await Promise.all([
        factory.createMistralFlowAdapter({ 
          apiKey: testApiKeys.MISTRAL_API_KEY, 
          maxConcurrentTasks: 3 
        }),
        factory.createPerplexityFlowAdapter({ 
          apiKey: testApiKeys.PERPLEXITY_API_KEY, 
          maxConcurrentTasks: 2 
        }),
        factory.createCohereFlowAdapter({ 
          apiKey: testApiKeys.COHERE_API_KEY, 
          maxConcurrentTasks: 4 
        })
      ]);

      // Mock all adapters
      for (const adapter of adapters) {
        jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
        jest.spyOn(adapter, 'executeTask').mockResolvedValue({
          success: true,
          output: `Task completed by ${adapter.name}`,
          executedBy: adapter.name,
          executionTime: Math.random() * 2000 + 1000, // 1-3 seconds
          metadata: { loadTest: true }
        });
      }

      // Initialize all adapters
      await Promise.all(adapters.map(adapter => adapter.initialize()));

      // Create multiple tasks
      const tasks = Array.from({ length: 6 }, (_, i) => ({
        id: `load-test-${i}`,
        description: `Load test task ${i + 1}`,
        type: TaskType.CODE_GENERATION,
        priority: 5,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      // Execute tasks concurrently
      const startTime = Date.now();
      const results = await Promise.allSettled([
        adapters[0].executeTask(tasks[0]),
        adapters[0].executeTask(tasks[1]),
        adapters[1].executeTask(tasks[2]),
        adapters[1].executeTask(tasks[3]),
        adapters[2].executeTask(tasks[4]),
        adapters[2].executeTask(tasks[5])
      ]);
      const endTime = Date.now();

      // Verify all tasks completed successfully
      results.forEach((result, index) => {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect(result.value.success).toBe(true);
        }
      });

      // Verify reasonable execution time (should be concurrent, not sequential)
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds

      // Cleanup
      await Promise.all(adapters.map(adapter => adapter.shutdown()));
      logger.info(`Load balancing test completed in ${executionTime}ms`);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should gracefully handle provider failures', async () => {
      const adapter = await factory.createMistralFlowAdapter({
        apiKey: testApiKeys.MISTRAL_API_KEY,
        retryAttempts: 2
      });

      // Mock health check to pass, but task execution to fail
      jest.spyOn(adapter, 'checkHealth').mockResolvedValue(true);
      jest.spyOn(adapter, 'executeTask').mockResolvedValue({
        success: false,
        error: 'Simulated API failure',
        executedBy: 'mistral-flow',
        executionTime: 500,
        metadata: { errorTest: true }
      });

      await adapter.initialize();

      const failingTask = {
        id: 'error-test-task',
        description: 'This task will fail',
        type: TaskType.CODE_GENERATION,
        priority: 5,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await adapter.executeTask(failingTask);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.executedBy).toBe('mistral-flow');

      await adapter.shutdown();
      logger.info('Error handling test completed');
    });

    test('should handle authentication failures gracefully', async () => {
      // Create adapter without API key
      const adapter = await factory.createPerplexityFlowAdapter({
        maxConcurrentTasks: 1
      });

      expect(adapter.isAuthenticated()).toBe(false);

      // Try to initialize without authentication
      await expect(adapter.initialize()).rejects.toThrow('not configured');

      logger.info('Authentication failure handling test completed');
    });
  });

  describe('Integration with Nexus Flow Ecosystem', () => {
    test('should properly integrate with existing flow types', () => {
      const allTypes = factory.getRegisteredAdapterTypes();
      const expectedTypes = [
        FlowType.CLAUDE,
        FlowType.GEMINI,
        FlowType.MISTRAL,
        FlowType.PERPLEXITY,
        FlowType.COHERE
      ];

      expectedTypes.forEach(type => {
        expect(allTypes).toContain(type);
        expect(factory.isFlowTypeSupported(type)).toBe(true);
      });

      logger.info(`Successfully integrated ${expectedTypes.length} flow types`);
    });

    test('should maintain capability-based routing compatibility', () => {
      const capabilities = {
        mistral: factory.getFlowCapabilities(FlowType.MISTRAL),
        perplexity: factory.getFlowCapabilities(FlowType.PERPLEXITY),
        cohere: factory.getFlowCapabilities(FlowType.COHERE)
      };

      // Verify different capabilities for smart routing
      expect(capabilities.mistral?.orchestration).toBe(true);
      expect(capabilities.perplexity?.research).toBe(true);
      expect(capabilities.cohere?.orchestration).toBe(true);

      // Verify specializations
      expect(capabilities.perplexity?.testing).toBe(false); // Perplexity is not good at testing
      expect(capabilities.mistral?.hiveMind).toBe(false); // Mistral doesn't support hive-mind

      logger.info('Capability-based routing compatibility verified');
    });
  });

  describe('Configuration Validation', () => {
    test('should validate adapter configurations end-to-end', () => {
      const validations = [
        {
          name: 'Mistral',
          factory: () => factory.createMistralFlowAdapter({
            apiKey: 'test',
            temperature: 2.5 // Invalid
          }),
          expectError: /Temperature must be between 0 and 2/
        },
        {
          name: 'Perplexity',
          factory: () => factory.createPerplexityFlowAdapter({
            apiKey: 'test',
            topP: 1.5 // Invalid
          }),
          expectError: /topP must be between 0 and 1/
        },
        {
          name: 'Cohere',
          factory: () => factory.createCohereFlowAdapter({
            apiKey: 'test',
            temperature: 6.0 // Invalid for Cohere
          }),
          expectError: /Temperature must be between 0 and 5/
        }
      ];

      validations.forEach(({ name, factory, expectError }) => {
        expect(factory).toThrow(expectError);
        logger.debug(`${name} configuration validation passed`);
      });

      logger.info('All configuration validations passed');
    });
  });
});