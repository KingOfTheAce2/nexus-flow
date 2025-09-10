export interface NexusConfig {
  flows: FlowConfig[];
  queenBee?: QueenBeeConfig;
  portal?: PortalConfig;
  logging?: LoggingConfig;
}

export interface FlowConfig {
  name: string;
  type: FlowType;
  enabled: boolean;
  config: FlowSpecificConfig;
  priority?: number;
  capabilities?: string[];
}

export enum FlowType {
  CLAUDE = 'claude-flow',
  GEMINI = 'gemini-flow',
  QWEN = 'qwen-flow',
  DEEPSEEK = 'deepseek-flow',
  COPILOT = 'copilot-flow',
  CODEX = 'codex-flow',
  MISTRAL = 'mistral-flow',
  PERPLEXITY = 'perplexity-flow',
  COHERE = 'cohere-flow',
  LLAMA = 'llama-flow',
  LOCAL = 'local-flow'
}

export interface FlowSpecificConfig {
  command?: string;
  apiKey?: string;
  endpoint?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  [key: string]: any;
}

export interface QueenBeeConfig {
  enabled: boolean;
  primaryFlow: string;
  delegationStrategy: DelegationStrategy;
  coordination: CoordinationConfig;
}

export enum DelegationStrategy {
  ROUND_ROBIN = 'round-robin',
  CAPABILITY_BASED = 'capability-based',
  LOAD_BALANCED = 'load-balanced',
  PRIORITY_BASED = 'priority-based',
  ADAPTIVE = 'adaptive'
}

export interface CoordinationConfig {
  maxConcurrentTasks: number;
  taskTimeout: number;
  retryPolicy: RetryPolicy;
  consensus?: ConsensusConfig;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelay: number;
}

export interface ConsensusConfig {
  required: boolean;
  threshold: number;
  validators: string[];
}

export interface PortalConfig {
  defaultFlow: string;
  autoDetection: boolean;
  fallbackChain: string[];
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  file?: string;
  console: boolean;
}

export interface Task {
  id: string;
  description: string;
  type: TaskType;
  priority: number;
  assignedFlow?: string;
  status: TaskStatus;
  result?: TaskResult;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum TaskType {
  CODE_GENERATION = 'code-generation',
  CODE_REVIEW = 'code-review',
  RESEARCH = 'research',
  ANALYSIS = 'analysis',
  DOCUMENTATION = 'documentation',
  TESTING = 'testing',
  REFACTORING = 'refactoring',
  ORCHESTRATION = 'orchestration'
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  DELEGATED = 'delegated',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface TaskResult {
  success: boolean;
  output?: string;
  error?: string;
  executedBy: string;
  executionTime: number;
  metadata?: Record<string, any>;
}

export interface FlowInstance {
  name: string;
  type: FlowType;
  status: FlowStatus;
  capabilities: string[];
  currentLoad: number;
  maxLoad: number;
  lastActivity: Date;
}

export enum FlowStatus {
  AVAILABLE = 'available',
  BUSY = 'busy',
  ERROR = 'error',
  OFFLINE = 'offline'
}

export interface DelegationDecision {
  taskId: string;
  targetFlow: string;
  reason: string;
  confidence: number;
  alternatives?: string[];
}

export interface NexusEvent {
  type: string;
  payload: any;
  timestamp: Date;
  source: string;
}