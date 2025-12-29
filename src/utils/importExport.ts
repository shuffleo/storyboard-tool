import { ProjectSnapshot, ProjectState, Shot } from '../types';
import { db } from '../db/indexeddb';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { useStore } from '../store/useStore';

export async function exportToJSON(): Promise<string> {
  const state = useStore.getState();
  const snapshot: ProjectSnapshot = {
    project: state.project,
    sequences: state.sequences,
    scenes: state.scenes,
    shots: state.shots,
    frames: state.frames,
  };
  return JSON.stringify(snapshot, null, 2);
}

export async function importFromJSON(json: string, replace: boolean = true): Promise<void> {
  const snapshot: ProjectSnapshot = JSON.parse(json);
  const state = useStore.getState();
  
  if (replace) {
    // Replace all content
    await db.importProject(snapshot);
    const loadedState = await db.loadProject();
    if (loadedState) {
      useStore.getState().loadProjectState(loadedState);
    }
  } else {
    // Add to existing content
    const currentState: ProjectState = {
      project: state.project, // Keep current project
      sequences: [...state.sequences, ...snapshot.sequences],
      scenes: [...state.scenes, ...snapshot.scenes],
      shots: [...state.shots, ...snapshot.shots],
      frames: [...state.frames, ...snapshot.frames],
      versions: state.versions, // Keep existing versions
    };
    await db.saveProject(currentState);
    useStore.getState().loadProjectState(currentState);
  }
}

export async function exportToCSV(): Promise<string> {
  const state = useStore.getState();

  const headers = ['Shot Code', 'Scene', 'Script Text', 'Duration', 'Status', 'Tags'];
  const rows = state.shots
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((shot) => {
      const scene = state.scenes.find((s) => s.id === shot.sceneId);
      return [
        shot.shotCode,
        scene ? `Scene ${scene.sceneNumber}` : '',
        `"${shot.scriptText.replace(/"/g, '""')}"`,
        shot.durationTarget.toString(),
        shot.status,
        shot.tags.join('; '),
      ];
    });

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

export async function importFromCSV(csv: string, replace: boolean = true): Promise<void> {
  const lines = csv.split('\n').filter((line) => line.trim());
  if (lines.length < 2) throw new Error('Invalid CSV format');

  const headers = lines[0].split(',').map((h) => h.trim());
  const shotCodeIndex = headers.indexOf('Shot Code');
  const sceneIndex = headers.indexOf('Scene');
  const scriptIndex = headers.indexOf('Script Text');
  const durationIndex = headers.indexOf('Duration');
  const statusIndex = headers.indexOf('Status');
  const tagsIndex = headers.indexOf('Tags');

  if (shotCodeIndex === -1) throw new Error('Missing "Shot Code" column');

  const state = useStore.getState();
  const createShot = useStore.getState().createShot;
  const updateShot = useStore.getState().updateShot;
  const scenes = state.scenes;

  if (replace) {
    // Clear existing shots and create new ones
    const existingShots = state.shots;
    // Delete all existing shots first
    const deleteShot = useStore.getState().deleteShot;
    existingShots.forEach(shot => deleteShot(shot.id));
    
    // Create shots for each CSV row
    for (let i = 0; i < lines.length - 1; i++) {
      createShot();
    }
  }

  // Update shots with CSV data
  const shots = useStore.getState().shots.sort((a, b) => a.orderIndex - b.orderIndex);
  for (let index = 0; index < lines.length - 1; index++) {
    const line = lines[index + 1];
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    
    let shot: Shot | undefined = shots[index];
    if (!shot && !replace) {
      // Create new shot if adding
      const shotId = createShot();
      const newShots = useStore.getState().shots;
      shot = newShots.find(s => s.id === shotId);
    }
    if (!shot) continue;

    // Find scene by name if provided
    let sceneId: string | undefined = undefined;
    if (values[sceneIndex]) {
      const sceneMatch = scenes.find((s) => 
        values[sceneIndex].includes(s.sceneNumber) || values[sceneIndex].includes(s.title)
      );
      if (sceneMatch) sceneId = sceneMatch.id;
    }

    updateShot(shot.id, {
      shotCode: values[shotCodeIndex] || shot.shotCode,
      scriptText: values[scriptIndex] || '',
      durationTarget: parseFloat(values[durationIndex]) || 0,
      status: (values[statusIndex] as any) || 'todo',
      tags: values[tagsIndex] ? values[tagsIndex].split(';').map((t) => t.trim()) : [],
      sceneId,
    });
  }
}

export async function exportStoryboardPDF(): Promise<void> {
  const state = useStore.getState();

  const pdf = new jsPDF();
  const shots = state.shots.sort((a, b) => a.orderIndex - b.orderIndex);
  const frames = state.frames;

  let y = 20;
  const pageHeight = pdf.internal.pageSize.height;
  const margin = 20;
  const imageWidth = 80;
  const imageHeight = 60;

  shots.forEach((shot) => {
    if (y + imageHeight + 40 > pageHeight - margin) {
      pdf.addPage();
      y = 20;
    }

    const shotFrames = frames.filter((f) => f.shotId === shot.id).sort((a, b) => a.orderIndex - b.orderIndex);

    pdf.setFontSize(12);
    pdf.text(`Shot ${shot.shotCode}`, margin, y);
    y += 8;

    if (shotFrames.length > 0) {
      try {
        pdf.addImage(shotFrames[0].image, 'JPEG', margin, y, imageWidth, imageHeight);
      } catch (e) {
        pdf.text('Image load error', margin, y + 10);
      }
    }

    y += imageHeight + 5;

    pdf.setFontSize(10);
    const scriptLines = pdf.splitTextToSize(shot.scriptText || '', 170);
    pdf.text(scriptLines, margin, y);
    y += scriptLines.length * 5 + 10;
  });

  pdf.save(`${state.project.title}-storyboard.pdf`);
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Converts a base64 data URL to binary data
 */
function base64ToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Gets file extension from mime type
 */
function getExtensionFromMime(mime: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };
  return mimeMap[mime] || 'png';
}

/**
 * Exports project data and all images to a ZIP file
 */
export async function exportToZIP(): Promise<void> {
  const state = useStore.getState();
  const zip = new JSZip();

  // Add project JSON
  const snapshot: ProjectSnapshot = {
    project: state.project,
    sequences: state.sequences,
    scenes: state.scenes,
    shots: state.shots,
    frames: state.frames,
  };
  zip.file('project.json', JSON.stringify(snapshot, null, 2));

  // Create images directory
  const imagesFolder = zip.folder('images');
  if (!imagesFolder) {
    throw new Error('Failed to create images folder in ZIP');
  }

  // Extract and add all images
  const imageMap = new Map<string, { counter: number; filename: string }>(); // Track image usage to avoid duplicates
  let imageCounter = 0;

  // First pass: collect all unique images and generate filenames
  for (const frame of state.frames) {
    if (!frame.image) continue;

    if (!imageMap.has(frame.image)) {
      imageCounter++;
      const mime = frame.image.split(',')[0].match(/:(.*?);/)?.[1] || 'image/png';
      const extension = getExtensionFromMime(mime);
      const filename = `frame-${String(imageCounter).padStart(4, '0')}.${extension}`;
      imageMap.set(frame.image, { counter: imageCounter, filename });
    }
  }

  // Second pass: extract images and add to ZIP
  for (const [imageData, { filename }] of imageMap.entries()) {
    try {
      const blob = base64ToBlob(imageData);
      const arrayBuffer = await blob.arrayBuffer();
      imagesFolder.file(filename, arrayBuffer);
    } catch (error) {
      console.error(`Failed to process image ${filename}:`, error);
    }
  }

  // Create a mapping file that links frame IDs to image filenames
  const imageMapping: Record<string, string> = {};
  state.frames.forEach(frame => {
    if (frame.image && imageMap.has(frame.image)) {
      imageMapping[frame.id] = imageMap.get(frame.image)!.filename;
    }
  });
  zip.file('image-mapping.json', JSON.stringify(imageMapping, null, 2));

  // Generate ZIP file
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  
  // Download ZIP file
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.project.title}-with-images.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Imports project data and images from a ZIP file
 */
export async function importFromZIP(zipBlob: Blob, replace: boolean = true): Promise<void> {
  const zip = new JSZip();
  const zipData = await zip.loadAsync(zipBlob);

  // Read project.json
  const projectJsonFile = zipData.file('project.json');
  if (!projectJsonFile) {
    throw new Error('ZIP file does not contain project.json');
  }

  const jsonText = await projectJsonFile.async('string');
  const snapshot: ProjectSnapshot = JSON.parse(jsonText);

  // Read image mapping if it exists
  const imageMappingFile = zipData.file('image-mapping.json');
  const imageMapping: Record<string, string> = imageMappingFile 
    ? JSON.parse(await imageMappingFile.async('string'))
    : {};

  // Read images folder
  const imagesFolder = zipData.folder('images');
  if (imagesFolder) {
    // Convert image files back to base64 and update frames
    for (const [frameId, filename] of Object.entries(imageMapping)) {
      const imageFile = imagesFolder.file(filename);
      if (imageFile) {
        const arrayBuffer = await imageFile.async('arraybuffer');
        const blob = new Blob([arrayBuffer]);
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(blob);
        });
        
        // Update the frame with base64 data
        const frame = snapshot.frames.find(f => f.id === frameId);
        if (frame) {
          frame.image = base64;
        }
      }
    }
  }

  // Import the snapshot
  await importFromJSON(JSON.stringify(snapshot), replace);
}

export async function importImages(files: FileList): Promise<void> {
  const createShot = useStore.getState().createShot;
  const addFrame = useStore.getState().addFrame;

  // Find Scene 0 (createShot will create it if it doesn't exist)
  const state = useStore.getState();
  let scene0 = state.scenes.find((s) => s.sceneNumber === '0');
  const scene0Id = scene0?.id;

  // Create a new shot for each image in Scene 0
  // Each image becomes a separate shot with that image as its first frame
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.type.startsWith('image/')) continue;

    // Create a new shot (createShot will auto-assign to Scene 0 if no sceneId provided)
    // But we explicitly pass scene0Id if it exists, or undefined to let createShot handle it
    const shotId = createShot(scene0Id);
    
    // Add the image as a frame to the newly created shot
    const reader = new FileReader();
    await new Promise<void>((resolve) => {
      reader.onload = (e) => {
        if (e.target?.result) {
          addFrame(shotId, e.target.result as string, file.name);
        }
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }
}

