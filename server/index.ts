import { resolve } from 'path';
import { existsSync } from 'fs';
import { parseConfig } from './config.js';
import { StateManager } from './stateManager.js';
import { startFileWatcher } from './fileWatcher.js';
import { startWsServer } from './wsServer.js';
import { startAssetServer } from './assetServer.js';

async function main() {
  const config = parseConfig(process.argv.slice(2));
  const projectPath = resolve(config.projectPath);

  if (!existsSync(projectPath)) {
    console.error(`Project path does not exist: ${projectPath}`);
    process.exit(1);
  }

  const projectMd = resolve(projectPath, 'project.md');
  if (!existsSync(projectMd)) {
    console.error(`No project.md found in: ${projectPath}`);
    process.exit(1);
  }

  console.log(`Starting companion for: ${projectPath}`);

  const stateManager = new StateManager(projectPath);
  stateManager.loadFromDisk();
  console.log(`Loaded project: ${stateManager.getState().project.title}`);

  const wsServer = startWsServer({
    port: config.wsPort,
    stateManager,
    onMutationApplied: () => {},
  });
  console.log(`WebSocket server: ws://127.0.0.1:${config.wsPort}`);

  const assetSrv = startAssetServer({
    port: config.assetPort,
    projectPath,
  });

  const watcher = startFileWatcher({
    projectPath,
    debounceMs: config.debounceMs,
    stateManager,
    onDiff: (ops) => {
      console.log(`File change detected: ${ops.length} ops`);
      wsServer.broadcastDiff(ops);
    },
    onEditingStart: () => {
      console.log('Agent editing started');
      wsServer.broadcastAgentEditing();
    },
    onEditingDone: () => {
      console.log('Agent editing done');
      wsServer.broadcastAgentDone();
    },
  });
  console.log(`File watcher active`);

  const shutdown = () => {
    console.log('\nShutting down...');
    watcher.close();
    wsServer.close();
    assetSrv.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
