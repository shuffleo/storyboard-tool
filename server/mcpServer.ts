import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { StateManager } from './stateManager.js';
import type { DiffOp } from './protocol.js';
import {
  handleRead,
  handleWrite,
  handleReorder,
  handleExport,
  handleImport,
  handleTimeline,
  handleAssets,
  handleSync,
} from './mcpTools.js';

const TOOLS = [
  {
    name: 'storyboard_read',
    description: 'Read the current storyboard state. Returns project metadata, scenes, shots, and/or frames as JSON.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filter: {
          type: 'string',
          enum: ['all', 'project', 'scenes', 'shots', 'frames'],
          default: 'all',
          description: 'Which slice of the project to return',
        },
      },
    },
  },
  {
    name: 'storyboard_write',
    description: 'Apply one or more create/update/delete operations atomically. All operations succeed or all fail.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['create', 'update', 'delete'] },
              entity_type: { type: 'string', enum: ['scene', 'shot', 'frame'] },
              data: { type: 'object', description: 'Entity data.' },
            },
            required: ['action', 'entity_type', 'data'],
          },
          minItems: 1,
        },
      },
      required: ['operations'],
    },
  },
  {
    name: 'storyboard_reorder',
    description: 'Reorder scenes, shots within a scene, or frames within a shot.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        entity_type: { type: 'string', enum: ['scenes', 'shots', 'frames'] },
        ordered_ids: { type: 'array', items: { type: 'string' }, description: 'Complete list of entity IDs in desired order' },
        parent_id: { type: 'string', description: 'Scene ID (for shots) or Shot ID (for frames). Not needed for scenes.' },
      },
      required: ['entity_type', 'ordered_ids'],
    },
  },
  {
    name: 'storyboard_import',
    description: 'Import a project from JSON or CSV data.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        format: { type: 'string', enum: ['json', 'csv'] },
        data: { type: 'string', description: 'The import data as a string' },
        replace: { type: 'boolean', default: false, description: 'If true, replace entire project.' },
      },
      required: ['format', 'data'],
    },
  },
  {
    name: 'storyboard_export',
    description: 'Export the project in a given format.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        format: { type: 'string', enum: ['json', 'csv'] },
        output_path: { type: 'string', description: 'Optional file path to write export to.' },
      },
      required: ['format'],
    },
  },
  {
    name: 'storyboard_timeline',
    description: 'Timeline/animatics operations: get computed timeline with start/end times, or set shot durations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['get_timeline', 'set_durations'] },
        durations: { type: 'object', description: 'Map of shot_id -> duration_ms. Only for set_durations.', additionalProperties: { type: 'number' } },
      },
      required: ['action'],
    },
  },
  {
    name: 'storyboard_assets',
    description: 'Manage asset files (images, audio, video) in the project assets/ folder.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'delete', 'get_path'] },
        file_path: { type: 'string', description: 'Path to source file (for add) or asset to delete' },
        data: { type: 'string', description: 'Base64-encoded file data (alternative to file_path)' },
        filename: { type: 'string', description: 'Target filename in assets/ (for add with base64)' },
        shot_id: { type: 'string', description: 'Shot to attach asset to' },
        frame_index: { type: 'number', description: 'Frame index within shot' },
      },
      required: ['action'],
    },
  },
  {
    name: 'storyboard_sync',
    description: 'Control the live sync between companion server and connected PWA clients.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['status', 'push', 'pull', 'watch', 'unwatch'] },
      },
      required: ['action'],
    },
  },
];

export function createMcpServer(
  stateManager: StateManager,
  broadcastDiff: (ops: DiffOp[]) => void,
  projectPath: string
) {
  const server = new Server(
    { name: 'storyboard-companion', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'storyboard_read':
        return handleRead(stateManager, args as any);

      case 'storyboard_write':
        return await handleWrite(stateManager, broadcastDiff, args as any);

      case 'storyboard_reorder':
        return await handleReorder(stateManager, broadcastDiff, args as any);

      case 'storyboard_import':
        return await handleImport(stateManager, broadcastDiff, args as any);

      case 'storyboard_export':
        return handleExport(stateManager, args as any);

      case 'storyboard_timeline':
        return await handleTimeline(stateManager, broadcastDiff, args as any);

      case 'storyboard_assets':
        return await handleAssets(stateManager, broadcastDiff, projectPath, args as any);

      case 'storyboard_sync':
        return await handleSync(stateManager, broadcastDiff, projectPath, args as any);

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  return {
    server,
    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.log('MCP server started on stdio');
    },
  };
}
