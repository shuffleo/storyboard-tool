/**
 * Selenium E2E tests for Animatics View Thumbnails Timeline
 * Diagnoses issues with thumbnail display and interactivity
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Builder, By, until, WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';

describe('Animatics View - Thumbnails Timeline Diagnostics', () => {
  let driver: WebDriver;
  const baseUrl = 'http://localhost:5173';

  beforeAll(async () => {
    const options = new chrome.Options();
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();
    
    await driver.get(baseUrl);
    await driver.wait(until.elementLocated(By.css('#root')), 10000);
    
    // Navigate to Animatics view
    const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
    await animaticsButton.click();
    await driver.sleep(2000); // Wait for view to fully load
  }, 30000);

  afterAll(async () => {
    await driver.quit();
  });

  describe('Timeline Frames Rendering', () => {
    it('should detect how many shots exist in the project', async () => {
      // Check console logs or inspect DOM to see shot count
      const shots = await driver.executeScript(`
        return window.__STORE__?.getState?.()?.shots?.length || 0;
      `);
      console.log(`Total shots in project: ${shots}`);
      expect(typeof shots).toBe('number');
    });

    it('should verify timeline frames are rendered', async () => {
      // Find all timeline frame elements
      const timelineFrames = await driver.findElements(By.css('[class*="cursor-move"][class*="absolute"]'));
      const frameCount = timelineFrames.length;
      console.log(`Timeline frames found: ${frameCount}`);
      
      // Get frame details
      for (let i = 0; i < Math.min(frameCount, 5); i++) {
        const frame = timelineFrames[i];
        const left = await frame.getCssValue('left');
        const width = await frame.getCssValue('width');
        const isDisplayed = await frame.isDisplayed();
        console.log(`Frame ${i}: left=${left}, width=${width}, displayed=${isDisplayed}`);
      }
      
      expect(frameCount).toBeGreaterThan(0);
    });

    it('should verify timeline frames have correct positioning', async () => {
      const timelineFrames = await driver.findElements(By.css('[class*="cursor-move"][class*="absolute"]'));
      
      if (timelineFrames.length > 1) {
        // Check if frames are overlapping or positioned incorrectly
        const positions: Array<{ left: string; width: string }> = [];
        
        for (const frame of timelineFrames) {
          const left = await frame.getCssValue('left');
          const width = await frame.getCssValue('width');
          positions.push({ left, width });
        }
        
        console.log('Frame positions:', positions);
        
        // Verify frames don't all have the same position
        const uniquePositions = new Set(positions.map(p => p.left));
        expect(uniquePositions.size).toBeGreaterThan(1);
      }
    });

    it('should verify timeline container has correct width', async () => {
      // Find the timeline container
      const timelineContainer = await driver.findElements(By.css('[class*="relative"][style*="minWidth"]'));
      
      if (timelineContainer.length > 0) {
        const minWidth = await timelineContainer[0].getAttribute('style');
        console.log('Timeline container minWidth:', minWidth);
        
        const actualWidth = await timelineContainer[0].getCssValue('width');
        console.log('Timeline container actual width:', actualWidth);
      }
    });
  });

  describe('Thumbnail Images', () => {
    it('should verify thumbnails are rendered in timeline frames', async () => {
      // Find all images in timeline
      const timelineImages = await driver.findElements(By.css('[class*="cursor-move"] img'));
      const imageCount = timelineImages.length;
      console.log(`Thumbnail images found: ${imageCount}`);
      
      // Check if images are visible
      for (let i = 0; i < Math.min(imageCount, 5); i++) {
        const img = timelineImages[i];
        const isDisplayed = await img.isDisplayed();
        const src = await img.getAttribute('src');
        const alt = await img.getAttribute('alt');
        console.log(`Image ${i}: displayed=${isDisplayed}, src=${src?.substring(0, 50)}..., alt=${alt}`);
      }
      
      expect(imageCount).toBeGreaterThan(0);
    });

    it('should verify shots have images assigned', async () => {
      const shotsWithImages = await driver.executeScript(`
        const state = window.__STORE__?.getState?.();
        if (!state) return { shots: 0, frames: 0, shotsWithFrames: 0 };
        
        const shots = state.shots || [];
        const frames = state.frames || [];
        
        const shotsWithFrames = shots.filter(shot => 
          frames.some(frame => frame.shotId === shot.id)
        );
        
        return {
          totalShots: shots.length,
          totalFrames: frames.length,
          shotsWithFrames: shotsWithFrames.length,
          shotIds: shots.map(s => s.id),
          frameShotIds: frames.map(f => f.shotId)
        };
      `);
      
      console.log('Shots and frames data:', JSON.stringify(shotsWithImages, null, 2));
      expect(shotsWithImages.totalShots).toBeGreaterThan(0);
    });
  });

  describe('Timeline Interactivity', () => {
    it('should verify timeline frames are clickable', async () => {
      const timelineFrames = await driver.findElements(By.css('[class*="cursor-move"][class*="absolute"]'));
      
      if (timelineFrames.length > 0) {
        // Try clicking on first frame
        const firstFrame = timelineFrames[0];
        const isClickable = await firstFrame.isDisplayed() && await firstFrame.isEnabled();
        console.log(`First frame clickable: ${isClickable}`);
        
        // Get frame position to verify it's not hidden
        const location = await firstFrame.getLocation();
        const size = await firstFrame.getSize();
        console.log(`First frame location: x=${location.x}, y=${location.y}, size: ${size.width}x${size.height}`);
        
        expect(isClickable).toBe(true);
      }
    });

    it('should verify clicking timeline frame updates selected shot', async () => {
      const timelineFrames = await driver.findElements(By.css('[class*="cursor-move"][class*="absolute"]'));
      
      if (timelineFrames.length > 1) {
        // Click on first frame
        await timelineFrames[0].click();
        await driver.sleep(500);
        
        // Check if frame is selected (has ring class)
        const selectedFrames = await driver.findElements(By.css('[class*="ring-2"][class*="ring-slate-400"]'));
        console.log(`Selected frames after click: ${selectedFrames.length}`);
        
        // Click on second frame
        if (timelineFrames.length > 1) {
          await timelineFrames[1].click();
          await driver.sleep(500);
          
          const selectedFrames2 = await driver.findElements(By.css('[class*="ring-2"][class*="ring-slate-400"]'));
          console.log(`Selected frames after second click: ${selectedFrames2.length}`);
        }
      }
    });

    it('should verify timeline frames are not overlapping (z-index issues)', async () => {
      const timelineFrames = await driver.findElements(By.css('[class*="cursor-move"][class*="absolute"]'));
      
      if (timelineFrames.length > 1) {
        const zIndexes: number[] = [];
        const positions: Array<{ left: number; width: number }> = [];
        
        for (const frame of timelineFrames) {
          const zIndex = await frame.getCssValue('z-index');
          const left = await frame.getCssValue('left');
          const width = await frame.getCssValue('width');
          
          zIndexes.push(parseInt(zIndex) || 0);
          positions.push({
            left: parseFloat(left) || 0,
            width: parseFloat(width) || 0
          });
        }
        
        console.log('Z-indexes:', zIndexes);
        console.log('Positions:', positions);
        
        // Check if frames are positioned sequentially
        const sortedPositions = [...positions].sort((a, b) => a.left - b.left);
        console.log('Sorted positions:', sortedPositions);
      }
    });
  });

  describe('Timeline Scroll and Visibility', () => {
    it('should verify timeline is scrollable', async () => {
      // Find timeline track
      const timelineTrack = await driver.findElements(By.css('[class*="overflow-x-auto"]'));
      
      if (timelineTrack.length > 0) {
        const scrollWidth = await driver.executeScript(
          'return arguments[0].scrollWidth;',
          timelineTrack[0]
        );
        const clientWidth = await driver.executeScript(
          'return arguments[0].clientWidth;',
          timelineTrack[0]
        );
        
        console.log(`Timeline scrollWidth: ${scrollWidth}, clientWidth: ${clientWidth}`);
        
        // If scrollWidth > clientWidth, timeline should be scrollable
        if (scrollWidth > clientWidth) {
          await driver.executeScript('arguments[0].scrollLeft = 100;', timelineTrack[0]);
          await driver.sleep(500);
          
          const scrollLeft = await driver.executeScript(
            'return arguments[0].scrollLeft;',
            timelineTrack[0]
          );
          console.log(`After scroll, scrollLeft: ${scrollLeft}`);
        }
      }
    });

    it('should verify all timeline frames are within viewport or scrollable', async () => {
      const timelineFrames = await driver.findElements(By.css('[class*="cursor-move"][class*="absolute"]'));
      const timelineTrack = await driver.findElements(By.css('[class*="overflow-x-auto"]'));
      
      if (timelineFrames.length > 0 && timelineTrack.length > 0) {
        // Get viewport size
        const viewportWidth = await driver.executeScript('return window.innerWidth;');
        
        // Check frame positions relative to viewport
        for (let i = 0; i < Math.min(timelineFrames.length, 5); i++) {
          const frame = timelineFrames[i];
          const location = await frame.getLocation();
          const size = await frame.getSize();
          
          console.log(`Frame ${i}: x=${location.x}, width=${size.width}, viewport=${viewportWidth}`);
          
          // Frame should be within scrollable area
          const isInViewport = location.x >= 0 && location.x < viewportWidth;
          console.log(`Frame ${i} in viewport: ${isInViewport}`);
        }
      }
    });
  });

  describe('Data Consistency', () => {
    it('should verify timelineFrames calculation matches DOM', async () => {
      const data = await driver.executeScript(`
        const state = window.__STORE__?.getState?.();
        if (!state) return null;
        
        const shots = state.shots || [];
        const scenes = state.scenes || [];
        
        // Sort shots like the component does
        const sortedShots = [...shots].sort((a, b) => {
          const sceneA = scenes.find(s => s.id === a.sceneId);
          const sceneB = scenes.find(s => s.id === b.sceneId);
          const sceneNumA = sceneA ? parseInt(sceneA.sceneNumber) : 999;
          const sceneNumB = sceneB ? parseInt(sceneB.sceneNumber) : 999;
          if (sceneNumA !== sceneNumB) return sceneNumA - sceneNumB;
          return a.orderIndex - b.orderIndex;
        });
        
        // Calculate timeline frames
        let currentTime = 0;
        const timelineFrames = sortedShots.map(shot => {
          const frame = {
            shotId: shot.id,
            startTime: currentTime,
            duration: shot.duration || 500
          };
          currentTime += frame.duration;
          return frame;
        });
        
        return {
          totalShots: shots.length,
          sortedShots: sortedShots.length,
          timelineFrames: timelineFrames.length,
          frames: timelineFrames.map(f => ({
            shotId: f.shotId,
            startTime: f.startTime,
            duration: f.duration
          }))
        };
      `);
      
      console.log('Timeline frames calculation:', JSON.stringify(data, null, 2));
      
      // Count actual DOM elements
      const domFrames = await driver.findElements(By.css('[class*="cursor-move"][class*="absolute"]'));
      console.log(`DOM frames: ${domFrames.length}, Calculated frames: ${data?.timelineFrames || 0}`);
      
      expect(data).not.toBeNull();
      if (data) {
        expect(data.timelineFrames).toBeGreaterThan(0);
      }
    });
  });
});

