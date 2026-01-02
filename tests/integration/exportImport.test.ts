/**
 * Comprehensive test for export/import functionality
 * Tests data integrity across all export/import formats
 * Story: Alien Invasion → Happy Ending with Pudding Buffet
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../src/store/useStore';
import { ProjectSnapshot, Scene, Shot, StoryboardFrame } from '../../src/types';
import { 
  exportToJSON, 
  importFromJSON, 
  exportToCSV, 
  importFromCSV,
  importFromZIP,
  importIndexedDB
} from '../../src/utils/importExport';
import { db } from '../../src/db/indexeddb';
import JSZip from 'jszip';
import { ProjectSnapshot } from '../../src/types';

// Helper to create a simple base64 image (1x1 pixel PNG)
function createTestImage(color: string = 'red'): string {
  // Create a simple colored square as SVG, then convert to data URL
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect width="100" height="100" fill="${color}"/>
      <text x="50" y="50" font-family="Arial" font-size="12" fill="white" text-anchor="middle" dominant-baseline="middle">${color}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Create vivid test data: Alien Invasion → Pudding Buffet
function createAlienInvasionStory(): {
  project: any;
  scenes: Scene[];
  shots: Shot[];
  frames: StoryboardFrame[];
} {
  const project = {
    id: 'alien-invasion-project',
    title: 'Alien Invasion: The Pudding Solution',
    fps: 24,
    aspectRatio: '16:9',
    styleNotes: 'Vivid colors, dramatic lighting, whimsical ending',
    referenceLinks: ['https://example.com/aliens', 'https://example.com/pudding'],
    globalNotes: 'A heartwarming tale of intergalactic friendship through dessert',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const scenes: Scene[] = [
    {
      id: 'scene-1',
      sequenceId: undefined,
      sceneNumber: '1',
      title: 'The Arrival',
      summary: 'Massive alien ships appear in the sky, casting ominous shadows',
      orderIndex: 0,
      notes: 'Dark, foreboding atmosphere with purple and green alien lights',
    },
    {
      id: 'scene-2',
      sequenceId: undefined,
      sceneNumber: '2',
      title: 'First Contact',
      summary: 'Aliens emerge - they look terrifying but seem confused',
      orderIndex: 1,
      notes: 'Mix of fear and curiosity. Aliens have tentacles and glowing eyes',
    },
    {
      id: 'scene-3',
      sequenceId: undefined,
      sceneNumber: '3',
      title: 'The Discovery',
      summary: 'Humans discover aliens love pudding',
      orderIndex: 2,
      notes: 'Lighthearted moment - alien tries chocolate pudding and lights up',
    },
    {
      id: 'scene-4',
      sequenceId: undefined,
      sceneNumber: '4',
      title: 'The Buffet',
      summary: 'Grand pudding buffet brings everyone together',
      orderIndex: 3,
      notes: 'Colorful, joyful scene with tables full of every pudding imaginable',
    },
  ];

  const shots: Shot[] = [
    // Scene 1: The Arrival
    {
      id: 'shot-010',
      sceneId: 'scene-1',
      shotCode: '010',
      scriptText: 'EXT. SKY - DAY\n\nMassive triangular alien ships descend from the clouds. The sky darkens as hundreds of vessels block out the sun. People on the ground look up in terror.',
      duration: 3000,
      status: 'approved',
      tags: ['establishing', 'dramatic', 'sci-fi'],
      orderIndex: 0,
      cameraNotes: 'Wide angle, slow push in on the ships',
      animationNotes: 'Ships should have pulsing green lights',
      generalNotes: 'Reference: Independence Day but friendlier',
    },
    {
      id: 'shot-020',
      sceneId: 'scene-1',
      shotCode: '020',
      scriptText: 'EXT. CITY STREET - DAY\n\nPanic in the streets. People run, cars crash. A child drops their ice cream. The shadow of a ship passes over.',
      duration: 2500,
      status: 'approved',
      tags: ['action', 'chaos', 'human-reaction'],
      orderIndex: 1,
      cameraNotes: 'Handheld, chaotic movement',
      animationNotes: 'Multiple layers of people running',
      generalNotes: 'Show human vulnerability',
    },
    // Scene 2: First Contact
    {
      id: 'shot-030',
      sceneId: 'scene-2',
      shotCode: '030',
      scriptText: 'INT. ALIEN SHIP - DAY\n\nA door opens. Strange light pours out. Three aliens step forward. They have tentacles, three eyes, and look confused rather than menacing.',
      duration: 4000,
      status: 'approved',
      tags: ['reveal', 'character-intro', 'comedy'],
      orderIndex: 2,
      cameraNotes: 'Slow reveal, start on feet, pan up',
      animationNotes: 'Aliens should look slightly comical, not scary',
      generalNotes: 'Key moment - subvert expectations',
    },
    {
      id: 'shot-040',
      sceneId: 'scene-2',
      shotCode: '040',
      scriptText: 'EXT. LANDING SITE - DAY\n\nAlien leader extends a tentacle. Human ambassador cautiously shakes it. Both look surprised when nothing explodes.',
      duration: 3000,
      status: 'approved',
      tags: ['tension', 'comedy', 'first-contact'],
      orderIndex: 3,
      cameraNotes: 'Two-shot, focus on the handshake',
      animationNotes: 'Tentacle should be flexible and expressive',
      generalNotes: 'Moment of connection',
    },
    // Scene 3: The Discovery
    {
      id: 'shot-050',
      sceneId: 'scene-3',
      shotCode: '050',
      scriptText: 'INT. DIPLOMATIC HALL - DAY\n\nDuring negotiations, an alien spots a bowl of chocolate pudding. Their eyes (all three) widen. They point excitedly.',
      duration: 2500,
      status: 'approved',
      tags: ['comedy', 'discovery', 'turning-point'],
      orderIndex: 4,
      cameraNotes: 'Close-up on alien face, then cut to pudding',
      animationNotes: 'Alien expression should be childlike wonder',
      generalNotes: 'The moment everything changes',
    },
    {
      id: 'shot-060',
      sceneId: 'scene-3',
      shotCode: '060',
      scriptText: 'INT. DIPLOMATIC HALL - DAY\n\nAlien takes a spoonful. Their entire body glows with happiness. They make a sound like a happy whale. Everyone relaxes.',
      duration: 3500,
      status: 'approved',
      tags: ['comedy', 'joy', 'resolution'],
      orderIndex: 5,
      cameraNotes: 'Extreme close-up on alien face, then wide shot of relief',
      animationNotes: 'Glowing effect, particles of joy',
      generalNotes: 'The breakthrough moment',
    },
    // Scene 4: The Buffet
    {
      id: 'shot-070',
      sceneId: 'scene-4',
      shotCode: '070',
      scriptText: 'EXT. GRAND BUFFET - DAY\n\nA massive outdoor buffet with every pudding imaginable. Chocolate, vanilla, butterscotch, pistachio, mango. Tables stretch to the horizon.',
      duration: 5000,
      status: 'approved',
      tags: ['establishing', 'celebration', 'visual-feast'],
      orderIndex: 6,
      cameraNotes: 'Aerial shot, then crane down into the crowd',
      animationNotes: 'Vivid colors, steam rising, everything looks delicious',
      generalNotes: 'The visual climax - make it beautiful',
    },
    {
      id: 'shot-080',
      sceneId: 'scene-4',
      shotCode: '080',
      scriptText: 'EXT. GRAND BUFFET - DAY\n\nAliens and humans sit together, sharing pudding. Laughter fills the air. A small alien child teaches a human child how to eat with tentacles.',
      duration: 4000,
      status: 'approved',
      tags: ['heartwarming', 'unity', 'happy-ending'],
      orderIndex: 7,
      cameraNotes: 'Warm, golden hour lighting. Multiple vignettes',
      animationNotes: 'Show diversity - different aliens, different humans, all happy',
      generalNotes: 'The perfect ending',
    },
  ];

  const frames: StoryboardFrame[] = [
    // Shot 010 - Alien ships
    {
      id: 'frame-010-1',
      shotId: 'shot-010',
      image: createTestImage('#1a1a2e'), // Dark blue-gray sky
      caption: 'Wide shot: Massive triangular ships descending from clouds',
      orderIndex: 0,
      version: 1,
    },
    {
      id: 'frame-010-2',
      shotId: 'shot-010',
      image: createTestImage('#16213e'), // Darker sky
      caption: 'Close-up: Ship details with pulsing green lights',
      orderIndex: 1,
      version: 1,
    },
    // Shot 020 - Panic
    {
      id: 'frame-020-1',
      shotId: 'shot-020',
      image: createTestImage('#8b0000'), // Red for panic
      caption: 'People running in chaos, cars crashing',
      orderIndex: 0,
      version: 1,
    },
    {
      id: 'frame-020-2',
      shotId: 'shot-020',
      image: createTestImage('#4a0000'), // Darker red
      caption: 'Child dropping ice cream, shadow of ship overhead',
      orderIndex: 1,
      version: 1,
    },
    // Shot 030 - Alien reveal
    {
      id: 'frame-030-1',
      shotId: 'shot-030',
      image: createTestImage('#4b0082'), // Purple alien light
      caption: 'Door opens, strange light pours out',
      orderIndex: 0,
      version: 1,
    },
    {
      id: 'frame-030-2',
      shotId: 'shot-030',
      image: createTestImage('#9370db'), // Light purple
      caption: 'Three aliens step forward - tentacles, three eyes, confused expression',
      orderIndex: 1,
      version: 1,
    },
    // Shot 040 - Handshake
    {
      id: 'frame-040-1',
      shotId: 'shot-040',
      image: createTestImage('#2f4f4f'), // Dark slate
      caption: 'Alien extends tentacle, human ambassador reaches out',
      orderIndex: 0,
      version: 1,
    },
    {
      id: 'frame-040-2',
      shotId: 'shot-040',
      image: createTestImage('#708090'), // Slate gray
      caption: 'The handshake - both look surprised nothing explodes',
      orderIndex: 1,
      version: 1,
    },
    // Shot 050 - Pudding discovery
    {
      id: 'frame-050-1',
      shotId: 'shot-050',
      image: createTestImage('#8b4513'), // Brown for chocolate
      caption: 'Alien spots bowl of chocolate pudding',
      orderIndex: 0,
      version: 1,
    },
    {
      id: 'frame-050-2',
      shotId: 'shot-050',
      image: createTestImage('#ffd700'), // Gold for excitement
      caption: 'Close-up: All three eyes widen with wonder',
      orderIndex: 1,
      version: 1,
    },
    // Shot 060 - First taste
    {
      id: 'frame-060-1',
      shotId: 'shot-060',
      image: createTestImage('#ff69b4'), // Pink for joy
      caption: 'Alien takes spoonful, body begins to glow',
      orderIndex: 0,
      version: 1,
    },
    {
      id: 'frame-060-2',
      shotId: 'shot-060',
      image: createTestImage('#ff1493'), // Deep pink
      caption: 'Extreme close-up: Alien makes happy whale sound, everyone relaxes',
      orderIndex: 1,
      version: 1,
    },
    // Shot 070 - The buffet
    {
      id: 'frame-070-1',
      shotId: 'shot-070',
      image: createTestImage('#ff6347'), // Tomato red
      caption: 'Aerial: Massive buffet with tables stretching to horizon',
      orderIndex: 0,
      version: 1,
    },
    {
      id: 'frame-070-2',
      shotId: 'shot-070',
      image: createTestImage('#ffa500'), // Orange
      caption: 'Crane down: Every pudding imaginable - chocolate, vanilla, butterscotch, pistachio, mango',
      orderIndex: 1,
      version: 1,
    },
    {
      id: 'frame-070-3',
      shotId: 'shot-070',
      image: createTestImage('#ffd700'), // Gold
      caption: 'Detail: Steam rising, vivid colors, everything looks delicious',
      orderIndex: 2,
      version: 1,
    },
    // Shot 080 - Happy ending
    {
      id: 'frame-080-1',
      shotId: 'shot-080',
      image: createTestImage('#ffeb3b'), // Yellow for happiness
      caption: 'Wide shot: Aliens and humans sitting together, sharing pudding',
      orderIndex: 0,
      version: 1,
    },
    {
      id: 'frame-080-2',
      shotId: 'shot-080',
      image: createTestImage('#ffc107'), // Amber
      caption: 'Close-up: Small alien child teaching human child to eat with tentacles',
      orderIndex: 1,
      version: 1,
    },
    {
      id: 'frame-080-3',
      shotId: 'shot-080',
      image: createTestImage('#fff9c4'), // Light yellow
      caption: 'Final wide: Laughter fills the air, golden hour lighting, perfect ending',
      orderIndex: 2,
      version: 1,
    },
  ];

  return { project, scenes, shots, frames };
}

// Helper to compare project data (excluding timestamps and IDs that may change)
function compareProjectData(original: any, imported: any): void {
  expect(imported.title).toBe(original.title);
  expect(imported.fps).toBe(original.fps);
  expect(imported.aspectRatio).toBe(original.aspectRatio);
  expect(imported.styleNotes).toBe(original.styleNotes);
  expect(imported.referenceLinks).toEqual(original.referenceLinks);
  expect(imported.globalNotes).toBe(original.globalNotes);
}

function compareScenes(original: Scene[], imported: Scene[]): void {
  expect(imported.length).toBe(original.length);
  original.forEach((origScene, index) => {
    const impScene = imported.find(s => s.sceneNumber === origScene.sceneNumber);
    expect(impScene).toBeDefined();
    if (impScene) {
      expect(impScene.sceneNumber).toBe(origScene.sceneNumber);
      expect(impScene.title).toBe(origScene.title);
      expect(impScene.summary).toBe(origScene.summary);
      expect(impScene.notes).toBe(origScene.notes);
    }
  });
}

function compareShots(original: Shot[], imported: Shot[]): void {
  expect(imported.length).toBe(original.length);
  original.forEach((origShot) => {
    const impShot = imported.find(s => s.shotCode === origShot.shotCode);
    expect(impShot).toBeDefined();
    if (impShot) {
      expect(impShot.shotCode).toBe(origShot.shotCode);
      expect(impShot.scriptText).toBe(origShot.scriptText);
      expect(impShot.duration).toBe(origShot.duration);
      expect(impShot.status).toBe(origShot.status);
      expect(impShot.tags).toEqual(origShot.tags);
      expect(impShot.cameraNotes).toBe(origShot.cameraNotes);
      expect(impShot.animationNotes).toBe(origShot.animationNotes);
      expect(impShot.generalNotes).toBe(origShot.generalNotes);
      // Verify scene assignment
      const origScene = original.find(s => s.id === origShot.sceneId);
      const impScene = imported.find(s => s.id === impShot.sceneId);
      if (origScene && impScene) {
        expect(impScene.sceneNumber).toBe(origScene.sceneNumber);
      }
    }
  });
}

function compareFrames(original: StoryboardFrame[], imported: StoryboardFrame[]): void {
  expect(imported.length).toBe(original.length);
  
  // Group by shot
  const originalByShot = new Map<string, StoryboardFrame[]>();
  const importedByShot = new Map<string, StoryboardFrame[]>();
  
  original.forEach(f => {
    if (!originalByShot.has(f.shotId)) originalByShot.set(f.shotId, []);
    originalByShot.get(f.shotId)!.push(f);
  });
  
  imported.forEach(f => {
    if (!importedByShot.has(f.shotId)) importedByShot.set(f.shotId, []);
    importedByShot.get(f.shotId)!.push(f);
  });
  
  // Compare frames for each shot
  originalByShot.forEach((origFrames, shotId) => {
    const impFrames = importedByShot.get(shotId);
    expect(impFrames).toBeDefined();
    expect(impFrames?.length).toBe(origFrames.length);
    
    // Sort by orderIndex for comparison
    const sortedOrig = [...origFrames].sort((a, b) => a.orderIndex - b.orderIndex);
    const sortedImp = [...(impFrames || [])].sort((a, b) => a.orderIndex - b.orderIndex);
    
    sortedOrig.forEach((origFrame, index) => {
      const impFrame = sortedImp[index];
      expect(impFrame).toBeDefined();
      if (impFrame) {
        expect(impFrame.caption).toBe(origFrame.caption);
        expect(impFrame.orderIndex).toBe(origFrame.orderIndex);
        expect(impFrame.image).toBe(origFrame.image); // Base64 image should match exactly
      }
    });
  });
}

describe('Export/Import - Alien Invasion Story', () => {
  beforeEach(async () => {
    // Reset store and database
    const store = useStore.getState();
    await db.clearAll();
    store.loadProjectState({
      project: {
        id: 'test',
        title: 'Test',
        fps: 24,
        aspectRatio: '16:9',
        styleNotes: '',
        referenceLinks: [],
        globalNotes: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      sequences: [],
      scenes: [],
      shots: [],
      frames: [],
      versions: [],
    });
  });

  describe('JSON Export/Import', () => {
    it('should export and import JSON without data loss', async () => {
      const testData = createAlienInvasionStory();
      const store = useStore.getState();
      
      // Load test data
      store.loadProjectState({
        project: testData.project,
        sequences: [],
        scenes: testData.scenes,
        shots: testData.shots,
        frames: testData.frames,
        versions: [],
      });
      
      // Export
      const json = await exportToJSON();
      expect(json).toBeTruthy();
      const exported = JSON.parse(json);
      
      // Clear store
      store.loadProjectState({
        project: { ...testData.project, id: 'new' },
        sequences: [],
        scenes: [],
        shots: [],
        frames: [],
        versions: [],
      });
      
      // Import
      await importFromJSON(json, true);
      const imported = useStore.getState();
      
      // Verify no data loss
      compareProjectData(testData.project, imported.project);
      compareScenes(testData.scenes, imported.scenes);
      compareShots(testData.shots, imported.shots);
      compareFrames(testData.frames, imported.frames);
    });
  });

  describe('CSV Export/Import', () => {
    it('should export and import CSV without losing shot data', async () => {
      const testData = createAlienInvasionStory();
      const store = useStore.getState();
      
      // Load test data
      store.loadProjectState({
        project: testData.project,
        sequences: [],
        scenes: testData.scenes,
        shots: testData.shots,
        frames: testData.frames,
        versions: [],
      });
      
      // Export CSV
      const csv = await exportToCSV();
      expect(csv).toBeTruthy();
      expect(csv).toContain('Shot Code');
      expect(csv).toContain('010');
      expect(csv).toContain('Alien ships descend');
      
      // Clear store
      store.loadProjectState({
        project: { ...testData.project, id: 'new' },
        sequences: [],
        scenes: [],
        shots: [],
        frames: [],
        versions: [],
      });
      
      // Import CSV
      await importFromCSV(csv, true);
      const imported = useStore.getState();
      
      // CSV doesn't preserve all data, but should preserve shots
      expect(imported.shots.length).toBe(testData.shots.length);
      
      // Verify key shot data is preserved
      const importedShot = imported.shots.find(s => s.shotCode === '010');
      expect(importedShot).toBeDefined();
      if (importedShot) {
        expect(importedShot.scriptText).toContain('Alien ships');
        expect(importedShot.duration).toBe(testData.shots[0].duration);
      }
    });
  });

  describe('ZIP Export/Import', () => {
    it('should export and import ZIP with images without data loss', async () => {
      const testData = createAlienInvasionStory();
      const store = useStore.getState();
      
      // Load test data
      store.loadProjectState({
        project: testData.project,
        sequences: [],
        scenes: testData.scenes,
        shots: testData.shots,
        frames: testData.frames,
        versions: [],
      });
      
      // Create ZIP manually using the same logic as exportToZIP
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      // Add project JSON
      const snapshot: ProjectSnapshot = {
        project: testData.project,
        sequences: [],
        scenes: testData.scenes,
        shots: testData.shots,
        frames: testData.frames,
      };
      zip.file('project.json', JSON.stringify(snapshot, null, 2));
      
      // Add images
      const imagesFolder = zip.folder('images');
      if (imagesFolder) {
        const imageMap = new Map<string, { counter: number; filename: string }>();
        let imageCounter = 0;
        
        // Collect unique images
        for (const frame of testData.frames) {
          if (!frame.image) continue;
          if (!imageMap.has(frame.image)) {
            imageCounter++;
            const mime = frame.image.split(',')[0].match(/:(.*?);/)?.[1] || 'image/png';
            const extension = mime === 'image/svg+xml' ? 'svg' : 'png';
            const filename = `frame-${String(imageCounter).padStart(4, '0')}.${extension}`;
            imageMap.set(frame.image, { counter: imageCounter, filename });
          }
        }
        
        // Add images to ZIP
        for (const [imageData, { filename }] of imageMap.entries()) {
          try {
            // Extract base64 data
            const base64Data = imageData.split(',')[1];
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            imagesFolder.file(filename, bytes);
          } catch (error) {
            console.error(`Failed to process image ${filename}:`, error);
          }
        }
        
        // Create image mapping
        const imageMapping: Record<string, string> = {};
        testData.frames.forEach(frame => {
          if (frame.image && imageMap.has(frame.image)) {
            imageMapping[frame.id] = imageMap.get(frame.image)!.filename;
          }
        });
        zip.file('image-mapping.json', JSON.stringify(imageMapping, null, 2));
      }
      
      // Generate ZIP blob
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Clear store
      store.loadProjectState({
        project: { ...testData.project, id: 'new' },
        sequences: [],
        scenes: [],
        shots: [],
        frames: [],
        versions: [],
      });
      
      // Import ZIP
      await importFromZIP(zipBlob, true);
      const imported = useStore.getState();
      
      // Verify no data loss
      compareProjectData(testData.project, imported.project);
      compareScenes(testData.scenes, imported.scenes);
      compareShots(testData.shots, imported.shots);
      compareFrames(testData.frames, imported.frames);
    });
  });

  describe('IndexedDB Export/Import', () => {
    it('should export and import IndexedDB without data loss', async () => {
      const testData = createAlienInvasionStory();
      const store = useStore.getState();
      
      // Load test data
      store.loadProjectState({
        project: testData.project,
        sequences: [],
        scenes: testData.scenes,
        shots: testData.shots,
        frames: testData.frames,
        versions: [],
      });
      
      // Save to IndexedDB
      await store.save();
      
      // Export IndexedDB - get the JSON directly
      const state = useStore.getState();
      const snapshot: ProjectSnapshot = {
        project: state.project,
        sequences: state.sequences,
        scenes: state.scenes,
        shots: state.shots,
        frames: state.frames,
      };
      const exportedJson = JSON.stringify(snapshot, null, 2);
      
      // Clear store and database
      await db.clearAll();
      store.loadProjectState({
        project: { ...testData.project, id: 'new' },
        sequences: [],
        scenes: [],
        shots: [],
        frames: [],
        versions: [],
      });
      
      // Create a File object from the JSON string
      const blob = new Blob([exportedJson], { type: 'application/json' });
      const file = new File([blob], 'test-indexeddb.json', { type: 'application/json' });
      
      // Import IndexedDB
      await importIndexedDB(file);
      const imported = useStore.getState();
      
      // Verify no data loss
      compareProjectData(testData.project, imported.project);
      compareScenes(testData.scenes, imported.scenes);
      compareShots(testData.shots, imported.shots);
      compareFrames(testData.frames, imported.frames);
    });
  });

  describe('Round-trip Tests', () => {
    it('should survive multiple export/import cycles', async () => {
      const testData = createAlienInvasionStory();
      const store = useStore.getState();
      
      // Load initial data
      store.loadProjectState({
        project: testData.project,
        sequences: [],
        scenes: testData.scenes,
        shots: testData.shots,
        frames: testData.frames,
        versions: [],
      });
      
      // Multiple export/import cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        const json = await exportToJSON();
        store.loadProjectState({
          project: { ...testData.project, id: `cycle-${cycle}` },
          sequences: [],
          scenes: [],
          shots: [],
          frames: [],
          versions: [],
        });
        await importFromJSON(json, true);
        
        const current = useStore.getState();
        expect(current.shots.length).toBe(testData.shots.length);
        expect(current.frames.length).toBe(testData.frames.length);
      }
      
      // Final verification
      const final = useStore.getState();
      compareProjectData(testData.project, final.project);
      compareScenes(testData.scenes, final.scenes);
      compareShots(testData.shots, final.shots);
      compareFrames(testData.frames, final.frames);
    });
  });

  describe('Edge Cases', () => {
    it('should handle shots with no frames', async () => {
      const testData = createAlienInvasionStory();
      // Remove some frames
      const shotsWithFrames = testData.frames.slice(0, 5);
      
      const store = useStore.getState();
      store.loadProjectState({
        project: testData.project,
        sequences: [],
        scenes: testData.scenes,
        shots: testData.shots,
        frames: shotsWithFrames,
        versions: [],
      });
      
      const json = await exportToJSON();
      store.loadProjectState({
        project: { ...testData.project, id: 'new' },
        sequences: [],
        scenes: [],
        shots: [],
        frames: [],
        versions: [],
      });
      
      await importFromJSON(json, true);
      const imported = useStore.getState();
      
      expect(imported.shots.length).toBe(testData.shots.length);
      expect(imported.frames.length).toBe(shotsWithFrames.length);
    });

    it('should preserve frame order within shots', async () => {
      const testData = createAlienInvasionStory();
      const store = useStore.getState();
      
      store.loadProjectState({
        project: testData.project,
        sequences: [],
        scenes: testData.scenes,
        shots: testData.shots,
        frames: testData.frames,
        versions: [],
      });
      
      const json = await exportToJSON();
      await importFromJSON(json, true);
      
      const imported = useStore.getState();
      
      // Check that frames maintain order
      const shot070Frames = imported.frames
        .filter(f => {
          const shot = imported.shots.find(s => s.id === f.shotId);
          return shot?.shotCode === '070';
        })
        .sort((a, b) => a.orderIndex - b.orderIndex);
      
      expect(shot070Frames.length).toBe(3);
      expect(shot070Frames[0].caption).toContain('Aerial');
      expect(shot070Frames[1].caption).toContain('Crane down');
      expect(shot070Frames[2].caption).toContain('Detail');
    });
  });
});

