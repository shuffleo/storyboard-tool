import type { ParsedProject, ParsedScene, ParsedShot, ParsedFrame, ParseResult } from './types.js';

function serializeDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms >= 60000 && ms % 60000 === 0) return `${ms / 60000}m`;
  const seconds = ms / 1000;
  if (Number.isInteger(seconds)) return `${seconds}s`;
  return `${seconds}s`;
}

function serializeProjectMd(project: ParsedProject): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`id: ${project.id}`);
  lines.push(`fps: ${project.fps}`);
  lines.push(`aspect_ratio: "${project.aspectRatio}"`);
  if (project.targetDuration !== undefined) {
    lines.push(`target_duration: ${project.targetDuration}`);
  }
  lines.push(`created_at: ${project.createdAt}`);
  lines.push(`updated_at: ${project.updatedAt}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${project.title}`);

  if (project.styleNotes || true) {
    lines.push('');
    lines.push('## Style Notes');
    lines.push('');
    lines.push(project.styleNotes || '');
  }

  lines.push('');
  lines.push('## Reference Links');
  lines.push('');
  if (project.referenceLinks.length > 0) {
    for (const link of project.referenceLinks) {
      lines.push(`- ${link}`);
    }
  }

  lines.push('');
  lines.push('## Global Notes');
  lines.push('');
  lines.push(project.globalNotes || '');
  lines.push('');

  return lines.join('\n');
}

function serializeFrame(frame: ParsedFrame): string {
  const caption = frame.caption ? ` "${frame.caption}"` : '';
  return `![${frame.label}](${frame.path}${caption})`;
}

function serializeShot(shot: ParsedShot): string {
  const lines: string[] = [];

  const meta: Record<string, any> = { id: shot.id };
  if (shot.tags.length > 0) meta.tags = shot.tags;
  lines.push(`<!-- shot: ${JSON.stringify(meta)} -->`);

  const duration = serializeDuration(shot.durationMs);
  lines.push(`### ${duration}: ${shot.title}`);

  if (shot.scriptText) {
    lines.push('');
    lines.push(shot.scriptText);
  }

  if (shot.generalNotes) {
    lines.push('');
    lines.push(`> ${shot.generalNotes}`);
  }

  if (shot.frames.length > 0) {
    lines.push('');
    for (const frame of shot.frames) {
      lines.push(serializeFrame(frame));
    }
  }

  return lines.join('\n');
}

function serializeSceneMd(scene: ParsedScene): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`id: ${scene.id}`);
  lines.push(`scene_number: "${scene.sceneNumber}"`);
  lines.push(`order_index: ${scene.orderIndex}`);
  lines.push('---');
  lines.push('');

  const sceneHeading = scene.sceneNumber
    ? `# Scene ${scene.sceneNumber}: ${scene.title}`
    : `# ${scene.title}`;
  lines.push(sceneHeading);

  if (scene.summary) {
    lines.push('');
    lines.push(scene.summary);
  }

  if (scene.notes) {
    lines.push('');
    lines.push('## Notes');
    lines.push('');
    lines.push(scene.notes);
  }

  if (scene.shots.length > 0) {
    lines.push('');
    lines.push('---');

    for (let i = 0; i < scene.shots.length; i++) {
      lines.push('');
      lines.push(serializeShot(scene.shots[i]));

      if (i < scene.shots.length - 1) {
        lines.push('');
        lines.push('---');
      }
    }
  }

  lines.push('');

  return lines.join('\n');
}

export function serializeProject(result: ParseResult): Map<string, string> {
  const files = new Map<string, string>();

  files.set('project.md', serializeProjectMd(result.project));

  for (const scene of result.scenes) {
    const filename = scene.sourceFile || `scene-${scene.sceneNumber.padStart(3, '0')}.md`;
    files.set(filename, serializeSceneMd(scene));
  }

  return files;
}

export { serializeDuration, serializeSceneMd, serializeProjectMd };
