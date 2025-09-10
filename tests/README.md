# Nexus Flow Testing Framework

This comprehensive testing framework ensures the reliability, performance, and user experience of the Nexus Flow LLM orchestration system.

## 🧪 Test Architecture

The testing framework is organized into multiple layers:

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── adapters/           # Adapter-specific unit tests
│   ├── core/               # Core system unit tests
│   └── cli/                # CLI command unit tests
├── integration/            # Integration tests for system components
│   ├── adapter-initialization.test.ts
│   ├── portal-compatibility.test.ts
│   └── queen-bee-compatibility.test.ts
├── e2e/                    # End-to-end workflow tests
│   ├── workflow-integration.test.ts
│   └── cli-user-acceptance.test.ts
├── performance/            # Performance benchmarking
│   └── adapter-benchmarks.test.ts
├── setup/                  # Test configuration and setup
│   ├── jest.setup.ts
│   ├── global-setup.ts
│   └── global-teardown.ts
├── mocks/                  # Mock implementations
│   └── mock-flow-adapter.ts
├── fixtures/               # Test data and configurations
│   ├── configs/
│   └── data/
└── utils/                  # Test utilities
```

## 🚀 Quick Start

### Running Tests

```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:performance

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Check test suite health
npm run test:health
```

### Using the Test Runner

The custom test runner provides advanced options:

```bash
# Run specific test types with custom options
node scripts/run-tests.js --type unit --verbose
node scripts/run-tests.js --type integration --no-coverage
node scripts/run-tests.js --type e2e --timeout 60000
node scripts/run-tests.js --type performance --sequential
```

## 📋 Test Categories

### Unit Tests
- **Purpose**: Test individual components in isolation
- **Coverage**: Adapters, core systems, utilities
- **Execution**: Fast, parallel execution
- **Mocking**: Extensive use of mocks and stubs

Key unit test files:
- `unit/adapters/base-flow-adapter.test.ts` - Base adapter functionality
- `unit/adapters/claude-flow-adapter.test.ts` - Claude Flow adapter
- `unit/core/nexus-engine.test.ts` - Core engine logic

### Integration Tests
- **Purpose**: Test component interactions and system integration
- **Coverage**: Adapter initialization, Portal routing, Queen Bee delegation
- **Execution**: Medium duration, controlled environments
- **Dependencies**: Mock external services, real internal components

Key integration test files:
- `integration/adapter-initialization.test.ts` - Adapter lifecycle testing
- `integration/portal-compatibility.test.ts` - Portal routing validation
- `integration/queen-bee-compatibility.test.ts` - Queen Bee delegation testing

### End-to-End Tests
- **Purpose**: Test complete user workflows and system behavior
- **Coverage**: CLI commands, workflow execution, user interactions
- **Execution**: Longer duration, realistic scenarios
- **Environment**: Near-production testing environment

Key E2E test files:
- `e2e/workflow-integration.test.ts` - Complete workflow testing
- `e2e/cli-user-acceptance.test.ts` - CLI user acceptance testing

### Performance Tests
- **Purpose**: Benchmark system performance and identify bottlenecks
- **Coverage**: Adapter response times, throughput, resource usage
- **Execution**: Long duration, resource-intensive
- **Metrics**: Execution time, memory usage, success rates

Key performance test files:
- `performance/adapter-benchmarks.test.ts` - LLM provider performance comparison

## 🔧 Configuration

### Jest Configuration
The main Jest configuration is in `jest.config.js` with:
- TypeScript support via ts-jest
- ESM module support
- Coverage thresholds (80% minimum)
- Multiple test projects for different test types
- Custom matchers and utilities

### Environment Variables
```bash
NODE_ENV=test                # Test environment
NEXUS_TEST_MODE=true        # Enable test mode
NEXUS_LOG_LEVEL=error       # Reduce log noise
```

### Coverage Thresholds
```javascript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80
  },
  './src/adapters/': {
    branches: 85,
    functions: 85,
    lines: 85,
    statements: 85
  },
  './src/core/': {
    branches: 85,
    functions: 85,
    lines: 85,
    statements: 85
  }
}
```

## 🛠 Test Development

### Writing Unit Tests
```typescript
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MockFlowAdapter } from '../../mocks/mock-flow-adapter.js';

describe('Component Name', () => {
  let component: ComponentClass;

  beforeEach(() => {
    component = new ComponentClass(mockConfig);
  });

  it('should perform expected behavior', async () => {
    const result = await component.method();
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });
});
```

### Using Mock Adapters
The `MockFlowAdapter` provides comprehensive testing capabilities:
```typescript
const mockAdapter = new MockFlowAdapter({
  name: 'test-adapter',
  type: FlowType.CLAUDE,
  version: '1.0.0-test',
  simulateDelay: 100,
  simulateErrors: false,
  authRequired: false
});

await mockAdapter.initialize();
const result = await mockAdapter.executeTask(testTask);
expect(result.success).toBe(true);
```

### Custom Test Utilities
Global test utilities are available via `global.testUtils`:
```typescript
// Validate numeric ranges
global.testUtils.expectToBeWithinRange(actual, min, max);

// Validate UUIDs
global.testUtils.expectToBeValidUUID(uuid);

// Validate timestamps
global.testUtils.expectToBeValidTimestamp(date);
```

## 📊 Test Reports and Coverage

### Coverage Reports
- HTML report: `coverage/index.html`
- LCOV format: `coverage/lcov.info`
- Text summary: Console output during test runs

### Test Result Reports
- JUnit XML: `test-results/junit.xml`
- HTML reports: `test-results/test-report.html`
- JSON reports: `test-results/test-report.json`

### Performance Reports
Performance tests generate detailed benchmarking reports:
- Execution time metrics
- Throughput measurements
- Success/failure rates
- Resource usage statistics

## 🔄 CI/CD Integration

### GitHub Actions Workflow
The `.github/workflows/test-suite.yml` provides comprehensive CI/CD testing:

1. **Code Quality Check** - Linting, type checking, formatting
2. **Unit Tests** - Fast feedback on core functionality
3. **Integration Tests** - Component interaction validation
4. **E2E Tests** - Complete workflow verification
5. **Performance Tests** - Benchmark validation
6. **Cross-Platform Tests** - Multi-OS compatibility
7. **Security Analysis** - Dependency and vulnerability scanning
8. **Coverage Analysis** - Code coverage validation

### Running CI Tests Locally
```bash
# Simulate the full CI pipeline
npm run test:health          # Check test suite health
npm run lint                 # Code quality
npm run typecheck            # Type validation
npm run test:all             # Full test suite
```

## 🐛 Debugging Tests

### Debug Configuration
For VS Code debugging, add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Jest Tests",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--no-cache"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Common Issues and Solutions

#### Test Timeouts
```bash
# Increase timeout for specific tests
npm test -- --testTimeout=60000

# For long-running E2E tests
npm run test:e2e -- --testTimeout=120000
```

#### Memory Issues
```bash
# Increase Node.js memory
node --max-old-space-size=4096 ./node_modules/.bin/jest

# Run tests sequentially
npm test -- --runInBand
```

#### Mock Issues
```typescript
// Clear mocks between tests
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});
```

## 📈 Test Metrics and KPIs

### Key Performance Indicators
- **Test Coverage**: Minimum 80% overall, 85% for core components
- **Test Execution Time**: Unit tests < 30s, Integration < 5min, E2E < 15min
- **Test Reliability**: > 95% pass rate in CI/CD pipeline
- **Performance Benchmarks**: Documented baseline metrics for each adapter

### Monitoring
- Coverage trends tracked in CI/CD
- Performance regression detection
- Test reliability monitoring
- Dependency vulnerability scanning

## 🤝 Contributing

### Adding New Tests
1. Choose appropriate test category (unit/integration/e2e/performance)
2. Follow existing naming conventions (`*.test.ts`)
3. Use provided mocks and utilities
4. Include both positive and negative test cases
5. Update coverage expectations if needed

### Test Review Checklist
- [ ] Tests cover both success and failure scenarios
- [ ] Appropriate use of mocks and fixtures
- [ ] Tests are deterministic and reliable
- [ ] Performance considerations documented
- [ ] Coverage thresholds maintained

### Best Practices
- Write descriptive test names
- Use arrange-act-assert pattern
- Keep tests focused and independent
- Mock external dependencies
- Clean up resources in teardown
- Document complex test scenarios

## 🆘 Support

For testing framework issues:
1. Check the test health status: `npm run test:health`
2. Review test logs and error messages
3. Consult this documentation
4. Check GitHub issues for known problems
5. Create a new issue with detailed reproduction steps

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Nexus Flow Architecture Documentation](../README.md)
- [CI/CD Pipeline Documentation](.github/workflows/README.md)