import { jest } from '@jest/globals';

// Global test setup for all test files

// Extend Jest timeout for complex operations
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Global test utilities
declare global {
  var testUtils: {
    expectToBeWithinRange: (actual: number, floor: number, ceiling: number) => void;
    expectToBeValidUUID: (value: string) => void;
    expectToBeValidTimestamp: (value: Date) => void;
    mockConsole: typeof console;
    restoreConsole: () => void;
  };
}

// Custom matchers and utilities
global.testUtils = {
  expectToBeWithinRange: (actual: number, floor: number, ceiling: number) => {
    expect(actual).toBeGreaterThanOrEqual(floor);
    expect(actual).toBeLessThanOrEqual(ceiling);
  },
  
  expectToBeValidUUID: (value: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(value).toMatch(uuidRegex);
  },
  
  expectToBeValidTimestamp: (value: Date) => {
    expect(value).toBeInstanceOf(Date);
    expect(value.getTime()).not.toBeNaN();
    expect(value.getTime()).toBeGreaterThan(0);
  },
  
  mockConsole: global.console,
  
  restoreConsole: () => {
    global.console = originalConsole;
  }
};

// Global cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

// Global cleanup after all tests
afterAll(() => {
  global.testUtils.restoreConsole();
});

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.NEXUS_LOG_LEVEL = 'error';

// Suppress winston logging during tests
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    printf: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

// Mock external dependencies
jest.mock('open', () => jest.fn());
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));

export {};