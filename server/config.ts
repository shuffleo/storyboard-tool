export interface CompanionConfig {
  projectPath: string;
  wsPort: number;
  assetPort: number;
  debounceMs: number;
}

export function parseConfig(args: string[]): CompanionConfig {
  let projectPath = '';
  let wsPort = parseInt(process.env.STORYBOARD_WS_PORT || '9800', 10);
  let assetPort = parseInt(process.env.STORYBOARD_ASSET_PORT || '9801', 10);
  let debounceMs = 300;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--project' || arg === '-p') && args[i + 1]) {
      projectPath = args[++i];
    } else if (arg === '--ws-port' && args[i + 1]) {
      wsPort = parseInt(args[++i], 10);
    } else if (arg === '--asset-port' && args[i + 1]) {
      assetPort = parseInt(args[++i], 10);
    } else if (arg === '--debounce' && args[i + 1]) {
      debounceMs = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-') && !projectPath) {
      projectPath = arg;
    }
  }

  if (!projectPath) {
    throw new Error('Project path required. Usage: storyboard-companion --project /path/to/project');
  }

  return { projectPath, wsPort, assetPort, debounceMs };
}
