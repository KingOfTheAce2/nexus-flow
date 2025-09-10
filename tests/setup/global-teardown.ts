import { promises as fs } from 'fs';
import { join } from 'path';

export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up Nexus Flow test environment...');
  
  // Clean up temporary test files
  await cleanupTempFiles();
  
  // Close any remaining connections
  await closeConnections();
  
  console.log('✅ Test environment cleanup complete');
}

async function cleanupTempFiles() {
  const tempDirs = [
    'tests/temp',
  ];
  
  for (const dir of tempDirs) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        await fs.unlink(join(dir, file));
      }
    } catch (error) {
      // Directory doesn't exist or other error - continue
    }
  }
}

async function closeConnections() {
  // Close database connections, cleanup sockets, etc.
  // This ensures clean test shutdown
}