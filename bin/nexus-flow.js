#!/usr/bin/env node

// Import the main CLI module
import('../src/cli/main.js').then(module => {
  // The main module exports a program that can be parsed
  const program = module.default;
  program.parse();
}).catch(err => {
  console.error('Failed to load nexus-flow:', err);
  console.error('This is an alpha release. Please ensure all dependencies are installed.');
  console.error('Try: npm install -g nexus-flow@alpha');
  process.exit(1);
});