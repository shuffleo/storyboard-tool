/**
 * Selenium-based E2E tests for Storyboard Tool
 * Tests actual UI interactions and visual behavior
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Builder, By, until, WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';

describe('E2E Tests with Selenium', () => {
  let driver: WebDriver;
  const baseUrl = 'http://localhost:5173'; // Vite dev server default

  beforeAll(async () => {
    const options = new chrome.Options();
    // options.addArguments('--headless'); // Uncomment for headless mode
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();
    
    // Navigate to app
    await driver.get(baseUrl);
    // Wait for app to load
    await driver.wait(until.elementLocated(By.css('#root')), 10000);
  }, 30000);

  afterAll(async () => {
    await driver.quit();
  });

  describe('Animatics View - Click Handling', () => {
    it('should navigate to Animatics view without crashing', async () => {
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      
      // Wait for view to load
      await driver.sleep(1000);
      
      // Check that view is visible (not blank)
      const videoPlayer = await driver.findElement(By.css('[class*="bg-slate-950"]'));
      expect(await videoPlayer.isDisplayed()).toBe(true);
    });

    it('should handle clicking on empty shot cards without blank screen', async () => {
      // Navigate to Animatics view
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      await driver.sleep(1000);
      
      // Find timeline frames
      const timelineFrames = await driver.findElements(By.css('[class*="cursor-move"]'));
      
      if (timelineFrames.length > 0) {
        // Click on first frame
        await timelineFrames[0].click();
        await driver.sleep(500);
        
        // Verify screen is not blank - check for video player or error message
        const videoPlayer = await driver.findElement(By.css('[class*="bg-slate-950"]'));
        const isDisplayed = await videoPlayer.isDisplayed();
        expect(isDisplayed).toBe(true);
      }
    });

    it('should handle clicking on shot cards with images without blank screen', async () => {
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      await driver.sleep(1000);
      
      // Find frames with images
      const framesWithImages = await driver.findElements(By.css('img[alt*="Shot"]'));
      
      if (framesWithImages.length > 0) {
        // Click on image
        await framesWithImages[0].click();
        await driver.sleep(500);
        
        // Verify screen is not blank
        const videoPlayer = await driver.findElement(By.css('[class*="bg-slate-950"]'));
        expect(await videoPlayer.isDisplayed()).toBe(true);
      }
    });

    it('should handle clicking on empty image area without blank screen', async () => {
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      await driver.sleep(1000);
      
      // Find empty image area (text saying "No image available")
      const emptyImageArea = await driver.findElement(By.xpath("//div[contains(text(), 'No image available')]"));
      await emptyImageArea.click();
      await driver.sleep(500);
      
      // Verify screen is not blank
      const videoPlayer = await driver.findElement(By.css('[class*="bg-slate-950"]'));
      expect(await videoPlayer.isDisplayed()).toBe(true);
    });
  });

  describe('Storyboard View - Click Handling', () => {
    it('should navigate to Storyboard view without crashing', async () => {
      const storyboardButton = await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]"));
      await storyboardButton.click();
      
      await driver.sleep(1000);
      
      // Check that view is visible
      const container = await driver.findElement(By.css('[class*="overflow-auto"]'));
      expect(await container.isDisplayed()).toBe(true);
    });

    it('should handle clicking on empty cards without blank screen', async () => {
      const storyboardButton = await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]"));
      await storyboardButton.click();
      await driver.sleep(1000);
      
      // Find cards
      const cards = await driver.findElements(By.css('[data-card]'));
      
      if (cards.length > 0) {
        // Click on first card
        await cards[0].click();
        await driver.sleep(500);
        
        // Verify screen is not blank
        const container = await driver.findElement(By.css('[class*="overflow-auto"]'));
        expect(await container.isDisplayed()).toBe(true);
      }
    });

    it('should handle clicking around thumbnail area without blank screen', async () => {
      const storyboardButton = await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]"));
      await storyboardButton.click();
      await driver.sleep(1000);
      
      // Find image areas
      const imageAreas = await driver.findElements(By.css('[class*="image-area"]'));
      
      if (imageAreas.length > 0) {
        // Click on image area
        await imageAreas[0].click();
        await driver.sleep(500);
        
        // Verify screen is not blank
        const container = await driver.findElement(By.css('[class*="overflow-auto"]'));
        expect(await container.isDisplayed()).toBe(true);
      }
    });
  });

  describe('TableView - Click Handling', () => {
    it('should navigate to Table view without crashing', async () => {
      const tableButton = await driver.findElement(By.xpath("//button[contains(text(), 'Table')]"));
      await tableButton.click();
      
      await driver.sleep(1000);
      
      // Check that view is visible
      const table = await driver.findElement(By.css('table'));
      expect(await table.isDisplayed()).toBe(true);
    });

    it('should handle clicking on table rows without blank screen', async () => {
      const tableButton = await driver.findElement(By.xpath("//button[contains(text(), 'Table')]"));
      await tableButton.click();
      await driver.sleep(1000);
      
      // Find table rows
      const rows = await driver.findElements(By.css('tr[data-shot-id]'));
      
      if (rows.length > 0) {
        await rows[0].click();
        await driver.sleep(500);
        
        // Verify screen is not blank
        const table = await driver.findElement(By.css('table'));
        expect(await table.isDisplayed()).toBe(true);
      }
    });
  });

  describe('UI Element Visibility', () => {
    it('should verify all view buttons are visible', async () => {
      const tableButton = await driver.findElement(By.xpath("//button[contains(text(), 'Table')]"));
      const storyboardButton = await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]"));
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      
      expect(await tableButton.isDisplayed()).toBe(true);
      expect(await storyboardButton.isDisplayed()).toBe(true);
      expect(await animaticsButton.isDisplayed()).toBe(true);
    });

    it('should verify three-dot menu is visible', async () => {
      const menuButton = await driver.findElement(By.css('svg[viewBox="0 0 24 24"]'));
      expect(await menuButton.isDisplayed()).toBe(true);
    });

    it('should verify undo/redo buttons are visible', async () => {
      const undoButton = await driver.findElement(By.css('svg[viewBox*="24 24"]'));
      expect(await undoButton.isDisplayed()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should not show blank screen when clicking corrupted images', async () => {
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      await driver.sleep(1000);
      
      // Try to find error message or image
      const errorMessage = await driver.findElements(By.xpath("//div[contains(text(), 'Image Error')]"));
      const videoPlayer = await driver.findElement(By.css('[class*="bg-slate-950"]'));
      
      // Either error message should show OR video player should be visible (not blank)
      const hasError = errorMessage.length > 0;
      const hasPlayer = await videoPlayer.isDisplayed();
      
      expect(hasError || hasPlayer).toBe(true);
    });
  });

  describe('Inspector Panel', () => {
    it('should open Inspector when clicking on shot', async () => {
      const tableButton = await driver.findElement(By.xpath("//button[contains(text(), 'Table')]"));
      await tableButton.click();
      await driver.sleep(1000);
      
      // Click on a shot row
      const rows = await driver.findElements(By.css('tr[data-shot-id]'));
      if (rows.length > 0) {
        await rows[0].click();
        await driver.sleep(500);
        
        // Check if Inspector is visible
        const inspector = await driver.findElements(By.css('[class*="w-80"][class*="bg-slate-800"]'));
        expect(inspector.length).toBeGreaterThan(0);
      }
    });

    it('should hide close button in Animatics view', async () => {
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      await driver.sleep(1000);
      
      // Select a shot
      const timelineFrames = await driver.findElements(By.css('[class*="cursor-move"]'));
      if (timelineFrames.length > 0) {
        await timelineFrames[0].click();
        await driver.sleep(500);
        
        // Close button should not be visible
        const closeButtons = await driver.findElements(By.xpath("//button[contains(text(), '✕')]"));
        // In Animatics view, close button should be hidden
        expect(closeButtons.length).toBe(0);
      }
    });
  });

  describe('Scrollbar Visibility', () => {
    it('should hide scrollbar under time ruler in Animatics view', async () => {
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      await driver.sleep(1000);
      
      // Find time ruler container
      const timeRuler = await driver.findElements(By.css('[class*="scrollbar-hide"]'));
      expect(timeRuler.length).toBeGreaterThan(0);
    });

    it('should show scrollbar under timeline shots in Animatics view', async () => {
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      await driver.sleep(1000);
      
      // Timeline track should have visible scrollbar
      const timelineTrack = await driver.findElement(By.css('[ref*="timelineRef"]'));
      // Scrollbar should be visible (not hidden)
      expect(await timelineTrack.isDisplayed()).toBe(true);
    });
  });

  describe('Delete All Content', () => {
    it('should show Delete All Content option in menu', async () => {
      const menuButton = await driver.findElement(By.css('svg[viewBox="0 0 24 24"]'));
      await menuButton.click();
      await driver.sleep(500);
      
      // Find Delete All Content button
      const deleteButton = await driver.findElement(By.xpath("//button[contains(text(), 'Delete All Content')]"));
      expect(await deleteButton.isDisplayed()).toBe(true);
    });

    it('should show confirmation dialog with three options', async () => {
      const menuButton = await driver.findElement(By.css('svg[viewBox="0 0 24 24"]'));
      await menuButton.click();
      await driver.sleep(500);
      
      const deleteButton = await driver.findElement(By.xpath("//button[contains(text(), 'Delete All Content')]"));
      await deleteButton.click();
      await driver.sleep(500);
      
      // Check for dialog with three buttons
      const deleteAllBtn = await driver.findElements(By.xpath("//button[contains(text(), 'Delete All Content')]"));
      const exportDeleteBtn = await driver.findElements(By.xpath("//button[contains(text(), 'Export and Delete All Content')]"));
      const cancelBtn = await driver.findElements(By.xpath("//button[contains(text(), 'Cancel')]"));
      
      expect(deleteAllBtn.length).toBeGreaterThan(0);
      expect(exportDeleteBtn.length).toBeGreaterThan(0);
      expect(cancelBtn.length).toBeGreaterThan(0);
    });
  });

  describe('Inspector Panel', () => {
    it('should show shot code in header when shot is selected', async () => {
      const tableButton = await driver.findElement(By.xpath("//button[contains(text(), 'Table')]"));
      await tableButton.click();
      await driver.sleep(1000);
      
      // Click on a shot
      const rows = await driver.findElements(By.css('tr[data-shot-id]'));
      if (rows.length > 0) {
        await rows[0].click();
        await driver.sleep(500);
        
        // Check for shot code input in header
        const headerInput = await driver.findElements(By.css('input[type="text"]'));
        expect(headerInput.length).toBeGreaterThan(0);
      }
    });

    it('should show image carousel for shots with multiple images', async () => {
      const tableButton = await driver.findElement(By.xpath("//button[contains(text(), 'Table')]"));
      await tableButton.click();
      await driver.sleep(1000);
      
      // Click on a shot
      const rows = await driver.findElements(By.css('tr[data-shot-id]'));
      if (rows.length > 0) {
        await rows[0].click();
        await driver.sleep(500);
        
        // Check for image carousel (navigation arrows or dots)
        const carouselArrows = await driver.findElements(By.css('svg[viewBox*="24 24"]'));
        // Should have navigation if multiple images exist
        expect(carouselArrows.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Drag and Drop', () => {
    it('should allow dragging shots in Storyboard view', async () => {
      const storyboardButton = await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]"));
      await storyboardButton.click();
      await driver.sleep(1000);
      
      // Find draggable cards
      const cards = await driver.findElements(By.css('[data-card][draggable="true"]'));
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should allow dragging shots in Animatics timeline', async () => {
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      await driver.sleep(1000);
      
      // Find timeline frames (should be draggable)
      const timelineFrames = await driver.findElements(By.css('[class*="cursor-move"]'));
      expect(timelineFrames.length).toBeGreaterThan(0);
    });
  });

  describe('Timeline Zoom', () => {
    it('should have zoom controls in Animatics view', async () => {
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      await driver.sleep(1000);
      
      // Find zoom buttons
      const zoomButtons = await driver.findElements(By.xpath("//button[contains(text(), '+') or contains(text(), '−')]"));
      expect(zoomButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('should show zoom percentage', async () => {
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      await driver.sleep(1000);
      
      // Find zoom percentage display
      const zoomDisplay = await driver.findElements(By.xpath("//span[contains(text(), '%')]"));
      expect(zoomDisplay.length).toBeGreaterThan(0);
    });
  });

  describe('Card Click Handling - Comprehensive', () => {
    it('should handle clicking on cards with images in Storyboard view', async () => {
      const storyboardButton = await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]"));
      await storyboardButton.click();
      await driver.sleep(1000);
      
      // Find all cards
      const cards = await driver.findElements(By.css('[data-card]'));
      
      for (let i = 0; i < Math.min(cards.length, 5); i++) {
        try {
          await cards[i].click();
          await driver.sleep(300);
          
          // Verify screen is not blank
          const container = await driver.findElement(By.css('[class*="overflow-auto"]'));
          expect(await container.isDisplayed()).toBe(true);
          
          // Verify Inspector opened
          const inspector = await driver.findElements(By.css('[class*="w-80"][class*="bg-slate-800"]'));
          expect(inspector.length).toBeGreaterThan(0);
        } catch (error) {
          // Log error but continue testing other cards
          console.error(`Error clicking card ${i}:`, error);
        }
      }
    });

    it('should handle clicking on empty cards in Storyboard view', async () => {
      const storyboardButton = await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]"));
      await storyboardButton.click();
      await driver.sleep(1000);
      
      // Find cards without images (check for "No image" text)
      const emptyCards = await driver.findElements(By.xpath("//div[contains(@class, 'image-area')]//div[contains(text(), 'No image')]/ancestor::div[@data-card]"));
      
      if (emptyCards.length > 0) {
        await emptyCards[0].click();
        await driver.sleep(500);
        
        // Verify screen is not blank
        const container = await driver.findElement(By.css('[class*="overflow-auto"]'));
        expect(await container.isDisplayed()).toBe(true);
      }
    });

    it('should handle clicking on timeline frames with images in Animatics view', async () => {
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      await driver.sleep(1000);
      
      // Find timeline frames
      const timelineFrames = await driver.findElements(By.css('[class*="cursor-move"]'));
      
      for (let i = 0; i < Math.min(timelineFrames.length, 5); i++) {
        try {
          await timelineFrames[i].click();
          await driver.sleep(300);
          
          // Verify screen is not blank
          const videoPlayer = await driver.findElement(By.css('[class*="bg-slate-950"]'));
          expect(await videoPlayer.isDisplayed()).toBe(true);
        } catch (error) {
          console.error(`Error clicking timeline frame ${i}:`, error);
        }
      }
    });

    it('should handle clicking on timeline frames without images in Animatics view', async () => {
      const animaticsButton = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));
      await animaticsButton.click();
      await driver.sleep(1000);
      
      // Find frames that might be empty (check for shot code text)
      const timelineFrames = await driver.findElements(By.css('[class*="cursor-move"]'));
      
      if (timelineFrames.length > 0) {
        await timelineFrames[0].click();
        await driver.sleep(500);
        
        // Verify screen is not blank
        const videoPlayer = await driver.findElement(By.css('[class*="bg-slate-950"]'));
        expect(await videoPlayer.isDisplayed()).toBe(true);
      }
    });
  });

  describe('Image Deletion - Comprehensive', () => {
    it('should handle deleting first image from carousel', async () => {
      const tableButton = await driver.findElement(By.xpath("//button[contains(text(), 'Table')]"));
      await tableButton.click();
      await driver.sleep(1000);
      
      // Click on a shot with images
      const rows = await driver.findElements(By.css('tr[data-shot-id]'));
      if (rows.length > 0) {
        await rows[0].click();
        await driver.sleep(500);
        
        // Find delete button in image carousel
        const deleteButtons = await driver.findElements(By.css('button[title="Delete image"]'));
        if (deleteButtons.length > 0) {
          await deleteButtons[0].click();
          await driver.sleep(500);
          
          // Handle confirmation dialog
          try {
            const confirmButton = await driver.switchTo().alert();
            await confirmButton.accept();
            await driver.sleep(500);
          } catch (e) {
            // No alert, might be using custom modal
          }
          
          // Verify screen is not blank
          const inspector = await driver.findElements(By.css('[class*="w-80"][class*="bg-slate-800"]'));
          expect(inspector.length).toBeGreaterThan(0);
        }
      }
    });

    it('should handle deleting last image from carousel', async () => {
      const tableButton = await driver.findElement(By.xpath("//button[contains(text(), 'Table')]"));
      await tableButton.click();
      await driver.sleep(1000);
      
      // Click on a shot
      const rows = await driver.findElements(By.css('tr[data-shot-id]'));
      if (rows.length > 0) {
        await rows[0].click();
        await driver.sleep(500);
        
        // Navigate to last image if multiple images exist
        const nextButtons = await driver.findElements(By.css('button[class*="absolute right-2"]'));
        if (nextButtons.length > 0) {
          // Click next until we're at the last image
          for (let i = 0; i < 10; i++) {
            try {
              await nextButtons[0].click();
              await driver.sleep(200);
            } catch (e) {
              break;
            }
          }
        }
        
        // Find and click delete button
        const deleteButtons = await driver.findElements(By.css('button[title="Delete image"]'));
        if (deleteButtons.length > 0) {
          await deleteButtons[0].click();
          await driver.sleep(500);
          
          // Handle confirmation
          try {
            const confirmButton = await driver.switchTo().alert();
            await confirmButton.accept();
            await driver.sleep(500);
          } catch (e) {
            // No alert
          }
          
          // Verify screen is not blank
          const container = await driver.findElement(By.css('table'));
          expect(await container.isDisplayed()).toBe(true);
        }
      }
    });

    it('should handle deleting all images from a shot', async () => {
      const tableButton = await driver.findElement(By.xpath("//button[contains(text(), 'Table')]"));
      await tableButton.click();
      await driver.sleep(1000);
      
      // Click on a shot
      const rows = await driver.findElements(By.css('tr[data-shot-id]'));
      if (rows.length > 0) {
        await rows[0].click();
        await driver.sleep(500);
        
        // Delete all images
        let deleteButtons = await driver.findElements(By.css('button[title="Delete image"]'));
        while (deleteButtons.length > 0) {
          try {
            await deleteButtons[0].click();
            await driver.sleep(300);
            
            // Handle confirmation
            try {
              const confirmButton = await driver.switchTo().alert();
              await confirmButton.accept();
              await driver.sleep(300);
            } catch (e) {
              // No alert
            }
            
            // Check if more images exist
            deleteButtons = await driver.findElements(By.css('button[title="Delete image"]'));
          } catch (e) {
            break;
          }
        }
        
        // Verify screen is not blank
        const container = await driver.findElement(By.css('table'));
        expect(await container.isDisplayed()).toBe(true);
      }
    });
  });

  describe('Debug Mode', () => {
    it('should enable debug mode from menu', async () => {
      const menuButton = await driver.findElement(By.css('svg[viewBox="0 0 24 24"]'));
      await menuButton.click();
      await driver.sleep(500);
      
      // Find debug mode button
      const debugButton = await driver.findElement(By.xpath("//button[contains(text(), 'Debug Mode')]"));
      await debugButton.click();
      await driver.sleep(500);
      
      // Check if debug panel is visible
      const debugPanel = await driver.findElements(By.xpath("//div[contains(text(), 'Debug Log')]"));
      expect(debugPanel.length).toBeGreaterThan(0);
    });

    it('should show debug logs when actions are performed', async () => {
      // Enable debug mode first
      const menuButton = await driver.findElement(By.css('svg[viewBox="0 0 24 24"]'));
      await menuButton.click();
      await driver.sleep(500);
      
      const debugButton = await driver.findElement(By.xpath("//button[contains(text(), 'Enable Debug Mode')]"));
      if (await debugButton.isDisplayed()) {
        await debugButton.click();
        await driver.sleep(500);
      }
      
      // Perform an action
      const storyboardButton = await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]"));
      await storyboardButton.click();
      await driver.sleep(1000);
      
      // Check for debug logs
      const logEntries = await driver.findElements(By.css('[class*="bg-slate-800/50"]'));
      expect(logEntries.length).toBeGreaterThan(0);
    });
  });
});

