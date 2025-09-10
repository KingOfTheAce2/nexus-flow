# 🌐 Nexus-Flow

**Universal AI Orchestrator - Portal to Any Flow with Queen Bee Coordination**

[![npm version](https://badge.fury.io/js/nexus-flow.svg)](https://badge.fury.io/js/nexus-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

Nexus-Flow is a cutting-edge universal AI orchestration platform that seamlessly integrates multiple LLM providers through intelligent routing, Queen Bee coordination, and Hive Mind collaboration systems.

## ✨ Features

### 🤖 **Multi-LLM Provider Support**
- **Claude (Anthropic)** - Advanced reasoning with hive-mind capabilities
- **Gemini (Google)** - Multimodal AI with A2A protocol support  
- **Mistral AI** - Advanced function calling and agentic tools
- **Perplexity AI** - Web search and real-time research
- **Cohere** - Enterprise-grade analysis and RAG integration

### 🎭 **Execution Modes**
- **🌐 Portal Mode** - Intelligent single-flow routing
- **👑 Queen Bee Mode** - Centralized coordination and delegation
- **🐝 Hive Mind Mode** - Multi-agent swarm collaboration

### 🔐 **Simple Authentication**
- Web-based authentication (no complex OAuth setup)
- Support for API keys and environment variables
- Unified auth management across all providers

### ⚡ **Advanced Workflows**
- Agentic workflow execution with multiple coordination strategies
- Built-in workflow templates for common tasks
- Real-time progress monitoring and event streaming

## 🚀 Quick Start

### Installation

```bash
# Install globally for CLI access
npm install -g nexus-flow@alpha

# Or use directly with npx
npx nexus-flow@alpha --help
```

### Initial Setup

```bash
# Initialize configuration
nexus-flow init

# Authenticate with AI providers
nexus-flow auth login --flow all

# Check system status
nexus-flow status
```

### Basic Usage

```bash
# Simple task execution with automatic provider selection
nexus-flow portal "Create a FastAPI application with authentication"

# Research-focused task
nexus-flow portal "Research latest developments in AI agents"

# Advanced workflow with Queen Bee coordination
nexus-flow workflow run "Build a comprehensive market analysis" --mode queen-bee

# Hive Mind collaboration for complex objectives
nexus-flow workflow run "Design and implement a distributed system" --mode hive-mind
```

## 📖 Documentation

### Authentication

```bash
# Authenticate with specific providers
nexus-flow auth login --flow claude      # Claude AI
nexus-flow auth login --flow gemini      # Google Gemini
nexus-flow auth login --flow mistral     # Mistral AI
nexus-flow auth login --flow perplexity  # Perplexity AI
nexus-flow auth login --flow cohere      # Cohere

# Check authentication status
nexus-flow auth status

# View authentication instructions
nexus-flow auth login --list
```

### Execution Modes

#### Portal Mode (Fast & Simple)
```bash
nexus-flow portal "Your task description"
nexus-flow portal "Generate Python code for data analysis" --type coding
nexus-flow portal "Research AI trends" --type research
```

#### Queen Bee Mode (Structured Coordination)
```bash
nexus-flow queen "Complex multi-step project"
nexus-flow queen "Build web application" --strategy adaptive
```

#### Hive Mind Mode (Collaborative Intelligence)
```bash
nexus-flow hive-mind "Research and implement new features"
```

#### Workflow Engine (Advanced Orchestration)
```bash
nexus-flow workflow run "Your objective" --mode portal
nexus-flow workflow run "Complex research project" --mode hive-mind --verify
nexus-flow workflow templates  # List available templates
```

### Configuration

```bash
nexus-flow config set flows.claude.enabled true
nexus-flow config set queenBee.delegationStrategy adaptive
nexus-flow config get  # View current configuration
```

## 🛠️ Provider Capabilities

| Provider | Code Generation | Research | Analysis | Function Calling | Web Search | Hive Mind |
|----------|----------------|----------|----------|------------------|------------|-----------|
| **Claude** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ❌ | ⭐⭐⭐ |
| **Gemini** | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐ | ❌ | ❌ |
| **Mistral** | ⭐⭐ | ⭐ | ⭐ | ⭐⭐ | ❌ | ❌ |
| **Perplexity** | ⭐ | ⭐⭐⭐ | ⭐ | ❌ | ⭐⭐⭐ | ❌ |
| **Cohere** | ⭐⭐ | ⭐ | ⭐⭐ | ⭐⭐ | ⭐ | ❌ |

## 🔧 Advanced Features

### Programmatic Usage

```typescript
import { NexusEngine, WorkflowEngine } from 'nexus-flow';

const engine = new NexusEngine();
await engine.initialize();

// Execute a simple task
const result = await engine.executeTask('Create a REST API endpoint');

// Use workflow engine
const workflowEngine = new WorkflowEngine(engine.flowRegistry);
const execution = await workflowEngine.executeAgenticWorkflow({
  objective: 'Build a comprehensive analysis',
  mode: 'queen-bee'
});
```

### Custom Adapters

Extend nexus-flow with custom LLM providers:

```typescript
import { BaseFlowAdapter } from 'nexus-flow';

class CustomFlowAdapter extends BaseFlowAdapter {
  // Implement your custom provider
}
```

## 📊 Performance & Monitoring

- **Real-time Metrics** - Track performance across all providers
- **Load Balancing** - Intelligent distribution of tasks
- **Health Monitoring** - Automatic failover and recovery
- **Cost Optimization** - Provider selection based on cost/performance

## 🧪 Alpha Release Notice

This is an **alpha release** (v0.1.0-alpha.0) of nexus-flow. While fully functional, it includes:

- ✅ Core orchestration capabilities
- ✅ Multi-provider integration
- ✅ Authentication system
- ✅ Workflow engine
- 🔄 Active development and testing
- 📝 Documentation improvements ongoing

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/nexus-flow/nexus-flow.git
cd nexus-flow
npm install
npm run build
npm test
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Documentation**: [Coming Soon]
- **Issues**: [GitHub Issues](https://github.com/nexus-flow/nexus-flow/issues)
- **Discussions**: [GitHub Discussions](https://github.com/nexus-flow/nexus-flow/discussions)

## 🌟 Star History

If you find nexus-flow useful, please consider giving us a star on GitHub!

---

*Built with ❤️ by the Nexus-Flow community*