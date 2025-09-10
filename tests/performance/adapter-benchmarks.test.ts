import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { MockFlowAdapter } from '../mocks/mock-flow-adapter.js';
import { FlowType, Task, TaskType, TaskStatus } from '../../src/types/index.js';

interface BenchmarkResult {
  adapterName: string;
  taskType: TaskType;
  executionTime: number;
  throughput: number;
  successRate: number;
  errorRate: number;
  memoryUsage?: number;
}

interface PerformanceMetrics {
  mean: number;
  median: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  stdDev: number;
}

class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];
  
  async benchmarkAdapter(
    adapter: MockFlowAdapter,
    tasks: Task[],
    options: {
      concurrency?: number;
      warmupRuns?: number;
      measureRuns?: number;
    } = {}
  ): Promise<BenchmarkResult[]> {
    const { concurrency = 1, warmupRuns = 5, measureRuns = 20 } = options;
    
    await adapter.initialize();
    
    try {
      // Warmup runs
      console.log(`Warming up ${adapter.name} with ${warmupRuns} runs...`);
      await this.runBenchmarkTasks(adapter, tasks.slice(0, warmupRuns), 1);
      adapter.resetMock();
      
      // Measure runs
      console.log(`Benchmarking ${adapter.name} with ${measureRuns} runs at concurrency ${concurrency}...`);
      const startTime = performance.now();
      const results = await this.runBenchmarkTasks(adapter, tasks.slice(0, measureRuns), concurrency);
      const totalTime = performance.now() - startTime;
      
      // Calculate metrics
      const successfulTasks = results.filter(r => r.success).length;
      const failedTasks = results.filter(r => !r.success).length;
      const avgExecutionTime = results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;
      
      const benchmarkResult: BenchmarkResult = {
        adapterName: adapter.name,
        taskType: tasks[0]?.type || TaskType.CODE_GENERATION,
        executionTime: avgExecutionTime,
        throughput: (successfulTasks / totalTime) * 1000, // tasks per second
        successRate: successfulTasks / results.length,
        errorRate: failedTasks / results.length,
        memoryUsage: this.measureMemoryUsage()
      };
      
      this.results.push(benchmarkResult);
      return [benchmarkResult];
      
    } finally {
      await adapter.shutdown();
    }
  }
  
  private async runBenchmarkTasks(
    adapter: MockFlowAdapter,
    tasks: Task[],
    concurrency: number
  ) {
    const batches: Task[][] = [];
    for (let i = 0; i < tasks.length; i += concurrency) {
      batches.push(tasks.slice(i, i + concurrency));
    }
    
    const allResults = [];
    for (const batch of batches) {
      const batchPromises = batch.map(task => adapter.executeTask(task));
      const batchResults = await Promise.all(batchPromises);
      allResults.push(...batchResults);
    }
    
    return allResults;
  }
  
  private measureMemoryUsage(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024; // MB
  }
  
  calculateMetrics(values: number[]): PerformanceMetrics {
    const sorted = values.sort((a, b) => a - b);
    const n = sorted.length;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / n;
    const median = n % 2 === 0 
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 
      : sorted[Math.floor(n / 2)];
    
    const p95Index = Math.ceil(0.95 * n) - 1;
    const p99Index = Math.ceil(0.99 * n) - 1;
    
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    
    return {
      mean,
      median,
      p95: sorted[p95Index] || sorted[n - 1],
      p99: sorted[p99Index] || sorted[n - 1],
      min: sorted[0],
      max: sorted[n - 1],
      stdDev
    };
  }
  
  generateReport(): string {
    if (this.results.length === 0) {
      return 'No benchmark results available';
    }
    
    const report = [];
    report.push('# LLM Provider Performance Benchmark Report');
    report.push('');
    report.push(`Generated: ${new Date().toISOString()}`);
    report.push(`Total adapters tested: ${new Set(this.results.map(r => r.adapterName)).size}`);
    report.push('');
    
    // Group by adapter
    const byAdapter = this.results.reduce((acc, result) => {
      if (!acc[result.adapterName]) acc[result.adapterName] = [];
      acc[result.adapterName].push(result);
      return acc;
    }, {} as Record<string, BenchmarkResult[]>);
    
    for (const [adapterName, results] of Object.entries(byAdapter)) {
      report.push(`## ${adapterName}`);
      report.push('');
      
      const executionTimes = results.map(r => r.executionTime);
      const throughputs = results.map(r => r.throughput);
      const successRates = results.map(r => r.successRate);
      
      const execMetrics = this.calculateMetrics(executionTimes);
      const throughputMetrics = this.calculateMetrics(throughputs);
      const avgSuccessRate = successRates.reduce((sum, rate) => sum + rate, 0) / successRates.length;
      
      report.push('### Execution Time (ms)');
      report.push(`- Mean: ${execMetrics.mean.toFixed(2)}`);
      report.push(`- Median: ${execMetrics.median.toFixed(2)}`);
      report.push(`- 95th percentile: ${execMetrics.p95.toFixed(2)}`);
      report.push(`- 99th percentile: ${execMetrics.p99.toFixed(2)}`);
      report.push(`- Min: ${execMetrics.min.toFixed(2)}`);
      report.push(`- Max: ${execMetrics.max.toFixed(2)}`);
      report.push('');
      
      report.push('### Throughput (tasks/sec)');
      report.push(`- Mean: ${throughputMetrics.mean.toFixed(2)}`);
      report.push(`- Median: ${throughputMetrics.median.toFixed(2)}`);
      report.push(`- Max: ${throughputMetrics.max.toFixed(2)}`);
      report.push('');
      
      report.push('### Reliability');
      report.push(`- Success Rate: ${(avgSuccessRate * 100).toFixed(2)}%`);
      report.push(`- Error Rate: ${((1 - avgSuccessRate) * 100).toFixed(2)}%`);
      report.push('');
      
      if (results[0]?.memoryUsage) {
        const avgMemory = results.reduce((sum, r) => sum + (r.memoryUsage || 0), 0) / results.length;
        report.push('### Resource Usage');
        report.push(`- Average Memory Usage: ${avgMemory.toFixed(2)} MB`);
        report.push('');
      }
    }
    
    // Comparison table
    report.push('## Adapter Comparison');
    report.push('');
    report.push('| Adapter | Avg Execution Time (ms) | Throughput (tasks/sec) | Success Rate | Memory (MB) |');
    report.push('|---------|-------------------------|------------------------|--------------|-------------|');
    
    for (const [adapterName, results] of Object.entries(byAdapter)) {
      const avgExecTime = results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;
      const avgThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;
      const avgSuccessRate = results.reduce((sum, r) => sum + r.successRate, 0) / results.length;
      const avgMemory = results.reduce((sum, r) => sum + (r.memoryUsage || 0), 0) / results.length;
      
      report.push(`| ${adapterName} | ${avgExecTime.toFixed(2)} | ${avgThroughput.toFixed(2)} | ${(avgSuccessRate * 100).toFixed(1)}% | ${avgMemory.toFixed(1)} |`);
    }
    
    return report.join('\n');
  }
  
  getResults(): BenchmarkResult[] {
    return [...this.results];
  }
  
  reset(): void {
    this.results = [];
  }
}

describe('LLM Provider Performance Benchmarks', () => {
  let benchmark: PerformanceBenchmark;
  
  beforeAll(() => {
    benchmark = new PerformanceBenchmark();
  });
  
  afterAll(() => {
    // Generate and log final report
    const report = benchmark.generateReport();
    console.log('\n' + report);
  });
  
  beforeEach(() => {
    benchmark.reset();
  });

  describe('Single Adapter Performance', () => {
    it('should benchmark Claude Flow adapter performance', async () => {
      const claudeAdapter = new MockFlowAdapter({
        name: 'claude-flow-benchmark',
        type: FlowType.CLAUDE,
        version: '1.0.0-bench',
        enabled: true,
        priority: 1,
        maxConcurrentTasks: 3,
        timeout: 30000,
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
        simulateDelay: 150, // Simulated network/processing delay
        simulateErrors: false,
        errorRate: 0,
      });

      const tasks = createBenchmarkTasks(50, TaskType.CODE_GENERATION);
      
      const results = await benchmark.benchmarkAdapter(claudeAdapter, tasks, {
        concurrency: 2,
        warmupRuns: 5,
        measureRuns: 20
      });
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      expect(result.adapterName).toBe('claude-flow-benchmark');
      expect(result.executionTime).toBeGreaterThan(100); // Should be around simulateDelay
      expect(result.executionTime).toBeLessThan(500);
      expect(result.throughput).toBeGreaterThan(0);
      expect(result.successRate).toBe(1.0); // 100% success rate
      expect(result.errorRate).toBe(0);
      expect(result.memoryUsage).toBeGreaterThan(0);
    }, 60000);

    it('should benchmark Gemini Flow adapter performance', async () => {
      const geminiAdapter = new MockFlowAdapter({
        name: 'gemini-flow-benchmark',
        type: FlowType.GEMINI,
        version: '1.0.0-bench',
        enabled: true,
        priority: 1,
        maxConcurrentTasks: 4,
        timeout: 25000,
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
        simulateDelay: 120, // Faster response time
        simulateErrors: false,
        errorRate: 0,
      });

      const tasks = createBenchmarkTasks(50, TaskType.RESEARCH);
      
      const results = await benchmark.benchmarkAdapter(geminiAdapter, tasks, {
        concurrency: 3,
        warmupRuns: 5,
        measureRuns: 25
      });
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      expect(result.adapterName).toBe('gemini-flow-benchmark');
      expect(result.executionTime).toBeGreaterThan(100);
      expect(result.executionTime).toBeLessThan(300);
      expect(result.successRate).toBe(1.0);
      expect(result.throughput).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Comparative Performance Testing', () => {
    it('should compare multiple adapters under identical conditions', async () => {
      const adapters = [
        new MockFlowAdapter({
          name: 'fast-adapter',
          type: FlowType.CLAUDE,
          version: '1.0.0-fast',
          enabled: true,
          priority: 1,
          maxConcurrentTasks: 5,
          timeout: 20000,
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
          simulateDelay: 80,
          simulateErrors: false,
        }),
        new MockFlowAdapter({
          name: 'balanced-adapter',
          type: FlowType.GEMINI,
          version: '1.0.0-balanced',
          enabled: true,
          priority: 1,
          maxConcurrentTasks: 3,
          timeout: 30000,
          retryAttempts: 2,
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
          simulateDelay: 150,
          simulateErrors: false,
        }),
        new MockFlowAdapter({
          name: 'reliable-adapter',
          type: FlowType.QWEN,
          version: '1.0.0-reliable',
          enabled: true,
          priority: 1,
          maxConcurrentTasks: 2,
          timeout: 45000,
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
          simulateDelay: 200,
          simulateErrors: true,
          errorRate: 0.05, // 5% error rate
        })
      ];

      const tasks = createBenchmarkTasks(30, TaskType.CODE_GENERATION);
      
      // Benchmark all adapters with identical tasks
      for (const adapter of adapters) {
        await benchmark.benchmarkAdapter(adapter, tasks, {
          concurrency: 2,
          warmupRuns: 3,
          measureRuns: 15
        });
      }
      
      const results = benchmark.getResults();
      expect(results).toHaveLength(3);
      
      // Verify each adapter has results
      const adapterNames = results.map(r => r.adapterName);
      expect(adapterNames).toContain('fast-adapter');
      expect(adapterNames).toContain('balanced-adapter');
      expect(adapterNames).toContain('reliable-adapter');
      
      // Fast adapter should have lowest execution time
      const fastResult = results.find(r => r.adapterName === 'fast-adapter')!;
      const balancedResult = results.find(r => r.adapterName === 'balanced-adapter')!;
      const reliableResult = results.find(r => r.adapterName === 'reliable-adapter')!;
      
      expect(fastResult.executionTime).toBeLessThan(balancedResult.executionTime);
      expect(balancedResult.executionTime).toBeLessThan(reliableResult.executionTime);
      
      // Reliable adapter should have lower success rate due to error simulation
      expect(reliableResult.successRate).toBeLessThan(fastResult.successRate);
      expect(reliableResult.successRate).toBeLessThan(balancedResult.successRate);
      
    }, 120000);
  });

  describe('Stress Testing', () => {
    it('should handle high concurrency load testing', async () => {
      const stressAdapter = new MockFlowAdapter({
        name: 'stress-test-adapter',
        type: FlowType.CLAUDE,
        version: '1.0.0-stress',
        enabled: true,
        priority: 1,
        maxConcurrentTasks: 10,
        timeout: 15000,
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
        simulateErrors: true,
        errorRate: 0.02, // 2% error rate under stress
      });

      const stressTasks = createBenchmarkTasks(100, TaskType.CODE_GENERATION);
      
      const results = await benchmark.benchmarkAdapter(stressAdapter, stressTasks, {
        concurrency: 8, // High concurrency
        warmupRuns: 10,
        measureRuns: 50
      });
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      expect(result.adapterName).toBe('stress-test-adapter');
      expect(result.throughput).toBeGreaterThan(5); // Should handle multiple tasks per second
      expect(result.successRate).toBeGreaterThan(0.95); // At least 95% success under stress
      expect(result.memoryUsage).toBeDefined();
      
    }, 180000);

    it('should measure memory usage under sustained load', async () => {
      const memoryAdapter = new MockFlowAdapter({
        name: 'memory-test-adapter',
        type: FlowType.GEMINI,
        version: '1.0.0-memory',
        enabled: true,
        priority: 1,
        maxConcurrentTasks: 3,
        timeout: 30000,
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
        simulateDelay: 50, // Fast execution to maximize throughput
      });

      const memoryTasks = createBenchmarkTasks(200, TaskType.ANALYSIS);
      
      const results = await benchmark.benchmarkAdapter(memoryAdapter, memoryTasks, {
        concurrency: 3,
        warmupRuns: 20,
        measureRuns: 100
      });
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      expect(result.memoryUsage).toBeGreaterThan(0);
      expect(result.memoryUsage).toBeLessThan(1000); // Should be reasonable (< 1GB)
      expect(result.successRate).toBe(1.0);
      
    }, 300000);
  });

  describe('Task Type Performance Comparison', () => {
    it('should compare performance across different task types', async () => {
      const taskTypeAdapter = new MockFlowAdapter({
        name: 'task-type-adapter',
        type: FlowType.CLAUDE,
        version: '1.0.0-tasktype',
        enabled: true,
        priority: 1,
        maxConcurrentTasks: 4,
        timeout: 30000,
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
        simulateDelay: 120,
      });

      const taskTypes = [
        TaskType.CODE_GENERATION,
        TaskType.CODE_REVIEW,
        TaskType.RESEARCH,
        TaskType.ANALYSIS,
        TaskType.DOCUMENTATION,
        TaskType.TESTING,
        TaskType.REFACTORING
      ];

      const allResults = [];
      
      for (const taskType of taskTypes) {
        const tasks = createBenchmarkTasks(20, taskType);
        const results = await benchmark.benchmarkAdapter(taskTypeAdapter, tasks, {
          concurrency: 2,
          warmupRuns: 3,
          measureRuns: 10
        });
        allResults.push(...results);
        
        // Reset adapter between task types
        taskTypeAdapter.resetMock();
      }

      expect(allResults).toHaveLength(taskTypes.length);
      
      // All task types should complete successfully
      allResults.forEach(result => {
        expect(result.successRate).toBe(1.0);
        expect(result.executionTime).toBeGreaterThan(100);
        expect(result.throughput).toBeGreaterThan(0);
      });
      
    }, 240000);
  });
});

// Helper function to create benchmark tasks
function createBenchmarkTasks(count: number, type: TaskType): Task[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `bench-task-${type}-${i}`,
    description: `Benchmark task ${i + 1} of type ${type}`,
    type,
    priority: 1,
    status: TaskStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: { 
      benchmark: true,
      iteration: i,
      complexity: i % 3 === 0 ? 'high' : i % 2 === 0 ? 'medium' : 'low'
    }
  }));
}