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
        (shot.duration / 1000).toString(), // Convert ms to seconds for CSV
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
    // Parse CSV: split by comma, trim, remove quotes
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    
    let shot: Shot | undefined = shots[index];
    if (!shot && !replace) {
      // Create new shot if adding
      const shotId = createShot();
      const newShots = useStore.getState().shots;
      shot = newShots.find(s => s.id === shotId);
    }
    if (!shot) continue;

    // Match scene by number or title
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
      duration: Math.max(300, (parseFloat(values[durationIndex]) || 1) * 1000), // Convert seconds to ms, min 300ms
      status: (values[statusIndex] as any) || 'todo',
      tags: values[tagsIndex] ? values[tagsIndex].split(';').map((t) => t.trim()) : [],
      sceneId,
    });
  }
}

export async function exportStoryboardPDF(): Promise<void> {
  const state = useStore.getState();

  const pdf = new jsPDF();
  const shots = state.shots.sort((a, b) => {
    // Sort by scene number first, then by shot code
    const sceneA = state.scenes.find(s => s.id === a.sceneId);
    const sceneB = state.scenes.find(s => s.id === b.sceneId);
    const sceneNumA = sceneA ? (parseInt(sceneA.sceneNumber, 10) || 0) : 9999;
    const sceneNumB = sceneB ? (parseInt(sceneB.sceneNumber, 10) || 0) : 9999;
    if (sceneNumA !== sceneNumB) return sceneNumA - sceneNumB;
    return parseInt(a.shotCode, 10) - parseInt(b.shotCode, 10);
  });
  const frames = state.frames;

  const pageWidth = pdf.internal.pageSize.width;
  const pageHeight = pdf.internal.pageSize.height;
  const margin = 15;
  const imageWidth = 55;
  const textWidth = pageWidth - margin * 2 - imageWidth - 10;
  const imagesPerPage = 3;
  let pageNumber = 1;
  let currentSceneId: string | undefined = undefined;

  const addPageNumber = () => {
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    const pageNumText = `Page ${pageNumber}`;
    const textWidth = pdf.getTextWidth(pageNumText);
    pdf.text(pageNumText, pageWidth - margin - textWidth, pageHeight - margin);
    pdf.setTextColor(0, 0, 0);
  };

  const addSceneHeader = (sceneId: string | undefined) => {
    if (!sceneId) return;
    const scene = state.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    const sceneTitle = scene.title && scene.title.trim() 
      ? `${scene.sceneNumber}: ${scene.title}`
      : `Scene ${scene.sceneNumber}`;
    pdf.text(sceneTitle, margin, 20);
    pdf.setFont('helvetica', 'normal');
    currentSceneId = sceneId;
  };

  let y = 35; // Start below scene header
  let imagesOnPage = 0;

  // Get natural image dimensions to preserve aspect ratio in PDF
  const getImageDimensions = (base64Image: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        resolve({ width: 55, height: 40 }); // Default dimensions
      };
      img.src = base64Image;
    });
  };

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    // Check if we need a new page (3 images per page)
    if (imagesOnPage >= imagesPerPage) {
      addPageNumber();
      pdf.addPage();
      pageNumber++;
      y = 35;
      imagesOnPage = 0;
      currentSceneId = undefined;
    }

    // Add scene header if scene changed
    if (shot.sceneId !== currentSceneId) {
      // If not at the top of a new page, we need to add scene header
      if (y > 35) {
        // Not enough space, go to next page
        addPageNumber();
        pdf.addPage();
        pageNumber++;
        y = 35;
        imagesOnPage = 0;
      }
      addSceneHeader(shot.sceneId);
      y = 35;
    }

    const shotFrames = frames.filter((f) => f.shotId === shot.id).sort((a, b) => a.orderIndex - b.orderIndex);

    // Shot code and duration
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Shot ${shot.shotCode}`, margin, y);
    // Add duration next to shot code
    const durationSeconds = (shot.duration / 1000).toFixed(1);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    const shotCodeWidth = pdf.getTextWidth(`Shot ${shot.shotCode}`);
    pdf.text(`(${durationSeconds}s)`, margin + shotCodeWidth + 3, y);
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    y += 6;

    // Image on the left
    const imageX = margin;
    const imageY = y;
    const maxImageWidth = 55;
    let actualImageWidth = maxImageWidth;
    let actualImageHeight = 40;
    
    if (shotFrames.length > 0) {
      try {
        // Get image dimensions to preserve aspect ratio
        const dimensions = await getImageDimensions(shotFrames[0].image);
        const aspectRatio = dimensions.width / dimensions.height;
        
        // Use max width, calculate height based on aspect ratio
        actualImageWidth = maxImageWidth;
        actualImageHeight = maxImageWidth / aspectRatio;
        
        // If height is too large, scale down based on height instead
        const maxImageHeight = 60;
        if (actualImageHeight > maxImageHeight) {
          actualImageHeight = maxImageHeight;
          actualImageWidth = maxImageHeight * aspectRatio;
        }
        
        // Determine image format from base64 string
        let format = 'JPEG';
        if (shotFrames[0].image.startsWith('data:image/png')) {
          format = 'PNG';
        } else if (shotFrames[0].image.startsWith('data:image/jpeg') || shotFrames[0].image.startsWith('data:image/jpg')) {
          format = 'JPEG';
        }
        
        pdf.addImage(shotFrames[0].image, format, imageX, imageY, actualImageWidth, actualImageHeight);
      } catch (e) {
        pdf.setFontSize(8);
        pdf.text('Image load error', imageX, imageY + actualImageHeight / 2);
      }
    } else {
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(imageX, imageY, actualImageWidth, actualImageHeight);
      pdf.setFontSize(8);
      pdf.text('No image', imageX + actualImageWidth / 2 - 10, imageY + actualImageHeight / 2);
    }

    // Text on the right
    const textX = margin + actualImageWidth + 10;
    let textY = imageY;

    // Script text
    if (shot.scriptText && shot.scriptText.trim()) {
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      const scriptLines = pdf.splitTextToSize(shot.scriptText, textWidth);
      pdf.text(scriptLines, textX, textY);
      textY += scriptLines.length * 4.5;
    }

    // General Notes with different color
    if (shot.generalNotes && shot.generalNotes.trim()) {
      textY += 2; // Small gap
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(100, 100, 150); // Different color for general notes
      const notesLines = pdf.splitTextToSize(shot.generalNotes, textWidth);
      pdf.text(notesLines, textX, textY);
      pdf.setTextColor(0, 0, 0); // Reset color
      textY += notesLines.length * 4.5;
    }

    // Move to next position
    y = Math.max(imageY + actualImageHeight, textY) + 8;
    imagesOnPage++;
  }

  // Add page number to last page
  addPageNumber();

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
 * Exports animatics as WebM video
 * Creates a video from shots with their durations
 */
export async function exportAnimaticsToMP4(): Promise<void> {
  const state = useStore.getState();
  const project = state.project;
  
  if (!project) {
    throw new Error('No project loaded');
  }

  // Sort shots by order
  const sortedShots = [...state.shots].sort((a, b) => {
    const sceneA = state.scenes.find(s => s.id === a.sceneId);
    const sceneB = state.scenes.find(s => s.id === b.sceneId);
    const sceneNumA = sceneA ? parseInt(sceneA.sceneNumber) : 999;
    const sceneNumB = sceneB ? parseInt(sceneB.sceneNumber) : 999;
    if (sceneNumA !== sceneNumB) return sceneNumA - sceneNumB;
    return a.orderIndex - b.orderIndex;
  });

  // Create canvas for rendering
  const canvas = document.createElement('canvas');
  canvas.width = 1920; // Full HD width
  canvas.height = 1080; // Full HD height
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }

  // Create video stream using MediaRecorder
  const stream = canvas.captureStream(30); // 30 FPS
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title || 'animatics'}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  mediaRecorder.start();

  // Render each shot
  for (const shot of sortedShots) {
    const shotFrames = state.frames
      .filter(f => f.shotId === shot.id)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    
    const frameImage = shotFrames[0]?.image;
    if (frameImage) {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          // Clear canvas
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw image centered
          const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
          const x = (canvas.width - img.width * scale) / 2;
          const y = (canvas.height - img.height * scale) / 2;
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
          
          resolve();
        };
        img.onerror = reject;
        img.src = frameImage;
      });
    } else {
      // Draw placeholder
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#64748b';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(shot.shotCode, canvas.width / 2, canvas.height / 2);
    }

    // Wait for shot duration
    await new Promise(resolve => setTimeout(resolve, shot.duration));
  }

  mediaRecorder.stop();
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

  // First pass: collect unique images (dedupe by base64 data)
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

  // Map frame IDs to image filenames for import restoration
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

/**
 * Exports the entire IndexedDB database as a JSON file
 */
export async function exportIndexedDB(): Promise<void> {
  const state = useStore.getState();
  const snapshot: ProjectSnapshot = {
    project: state.project,
    sequences: state.sequences,
    scenes: state.scenes,
    shots: state.shots,
    frames: state.frames,
  };
  const json = JSON.stringify(snapshot, null, 2);
  downloadFile(json, `${state.project.title || 'storyboard'}-indexeddb.json`, 'application/json');
}

/**
 * Imports an IndexedDB export file and replaces all current data
 */
export async function importIndexedDB(file: File): Promise<void> {
  const text = await file.text();
  const snapshot: ProjectSnapshot = JSON.parse(text);
  
  // Replace all content
  await db.importProject(snapshot);
  const loadedState = await db.loadProject();
  if (loadedState) {
    useStore.getState().loadProjectState(loadedState);
  }
}

