/**
 * Selenium-based E2E tests for Storyboard Tool
 * Tests actual UI interactions and visual behavior
 *
 * Requires: Vite dev server running on port 5173
 *   npm run dev
 *
 * Run with:
 *   npx vitest run tests/e2e/selenium.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Builder, By, until, WebDriver, WebElement } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';

const BASE_URL = 'http://localhost:5173';
const APP_URL = `${BASE_URL}?storage=internal`;

function seedScript(): string {
  return `
    const store = window.__storyboardStore;
    if (!store) throw new Error('Store not exposed on window');
    const s = store.getState();
    if (s.scenes.length > 0 && s.shots.length > 0) return 'already seeded';

    const sceneId1 = s.createScene();
    const sceneId2 = s.createScene();
    s.updateScene(sceneId1, { title: 'Opening', summary: 'The journey begins' });
    s.updateScene(sceneId2, { title: 'Climax', summary: 'The turning point' });

    const shots1 = s.shots.filter(sh => sh.sceneId === sceneId1);
    if (shots1.length > 0) {
      s.updateShot(shots1[0].id, {
        shotCode: '010',
        title: 'Wide establishing',
        scriptText: 'A sweeping vista of the mountains at dawn.',
        duration: 3000,
        generalNotes: 'Use warm golden tones',
      });
    }

    const shot2 = s.createShot(sceneId1);
    s.updateShot(shot2, {
      shotCode: '020',
      title: 'Close-up character',
      scriptText: 'Character looks up at the sky.',
      duration: 2000,
      generalNotes: 'Focus on expression',
    });

    const shots2 = s.shots.filter(sh => sh.sceneId === sceneId2);
    if (shots2.length > 0) {
      s.updateShot(shots2[0].id, {
        shotCode: '030',
        title: 'Action sequence',
        scriptText: 'Character runs through the forest.',
        duration: 4000,
        generalNotes: 'Fast pacing, shaky cam feel',
      });
    }

    return 'seeded';
  `;
}

async function waitForApp(driver: WebDriver): Promise<void> {
  await driver.wait(until.elementLocated(By.css('#root')), 10000);
  await driver.wait(
    async () => {
      const phase = await driver.executeScript(
        `const s = window.__storyboardStore; return s ? 'ready' : 'loading';`
      );
      return phase === 'ready';
    },
    10000,
    'Store never became available on window'
  );
  await driver.sleep(500);
}

async function ensureProjectView(driver: WebDriver): Promise<void> {
  const hasTopBar = await driver.findElements(By.xpath("//button[contains(text(), 'Table')]"));
  if (hasTopBar.length === 0) {
    const fallback = await driver.findElements(By.xpath("//button[contains(text(), 'Continue with Internal Storage')]"));
    if (fallback.length > 0) {
      await fallback[0].click();
      await driver.sleep(1000);
    }
  }
  await driver.wait(until.elementLocated(By.xpath("//button[contains(text(), 'Table')]")), 5000);
}

async function seedTestData(driver: WebDriver): Promise<void> {
  const result = await driver.executeScript(seedScript());
  if (result === 'seeded') {
    await driver.sleep(500);
  }
}

async function ensureMenuClosed(driver: WebDriver): Promise<void> {
  await driver.executeScript(`
    const el = document.querySelector('.absolute.right-0.mt-1.w-48');
    if (el) {
      const menuBtn = document.querySelector('button[title="Menu"]');
      if (menuBtn) menuBtn.click();
    }
  `);
  await driver.sleep(200);
}

async function openMenu(driver: WebDriver): Promise<void> {
  await ensureMenuClosed(driver);
  const menuBtn = await driver.findElement(By.css('button[title="Menu"]'));
  await menuBtn.click();
  await driver.sleep(400);
  await driver.wait(
    until.elementLocated(By.css('.absolute.right-0.mt-1.w-48')),
    3000
  );
}

async function openMenuAndFind(driver: WebDriver, text: string): Promise<WebElement> {
  await openMenu(driver);
  return driver.findElement(
    By.xpath(`//*[contains(@class, 'w-48')]//button[contains(text(), '${text}')] | //*[contains(@class, 'w-48')]//a[contains(text(), '${text}')]`)
  );
}

describe('E2E Tests with Selenium', () => {
  let driver: WebDriver;

  beforeAll(async () => {
    const options = new chrome.Options();
    options.addArguments('--headless=new');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--window-size=1280,900');

    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    await driver.get(APP_URL);
    await waitForApp(driver);
    await ensureProjectView(driver);
    await seedTestData(driver);
  }, 60000);

  afterAll(async () => {
    if (driver) await driver.quit();
  });

  // ─── Landing Screen ─────────────────────────────────────────────

  describe('Landing Screen', () => {
    it('should show landing screen when no storage param', async () => {
      await driver.get(BASE_URL);
      await driver.wait(until.elementLocated(By.css('#root')), 10000);
      await driver.sleep(2000);

      const heading = await driver.findElements(By.xpath("//h1[contains(text(), 'Storyboard')]"));
      const createBtn = await driver.findElements(By.xpath("//button[contains(text(), 'Create New Project')]"));
      const openBtn = await driver.findElements(By.xpath("//button[contains(text(), 'Open Existing Project')]"));
      const internalBtn = await driver.findElements(By.xpath("//button[contains(text(), 'Continue with Internal Storage')]"));

      const isLanding = heading.length > 0 &&
        (createBtn.length > 0 || openBtn.length > 0 || internalBtn.length > 0);
      expect(isLanding).toBe(true);

      // Navigate back to project view for remaining tests
      await driver.get(APP_URL);
      await waitForApp(driver);
      await ensureProjectView(driver);
      await seedTestData(driver);
    });

    it('should bypass landing screen with ?storage=internal', async () => {
      const tableBtn = await driver.findElements(By.xpath("//button[contains(text(), 'Table')]"));
      expect(tableBtn.length).toBeGreaterThan(0);
    });
  });

  // ─── View Navigation ────────────────────────────────────────────

  describe('View Navigation', () => {
    it('should have all view buttons visible', async () => {
      const tableBtn = await driver.findElement(By.xpath("//button[contains(text(), 'Table')]"));
      const storyboardBtn = await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]"));
      const animaticsBtn = await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]"));

      expect(await tableBtn.isDisplayed()).toBe(true);
      expect(await storyboardBtn.isDisplayed()).toBe(true);
      expect(await animaticsBtn.isDisplayed()).toBe(true);
    });

    it('should navigate to Table view', async () => {
      await driver.findElement(By.xpath("//button[contains(text(), 'Table')]")).then(b => b.click());
      await driver.sleep(500);
      const table = await driver.findElement(By.css('table'));
      expect(await table.isDisplayed()).toBe(true);
    });

    it('should navigate to Storyboard view', async () => {
      await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]")).then(b => b.click());
      await driver.sleep(500);
      const cards = await driver.findElements(By.css('[data-card]'));
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should navigate to Animatics view', async () => {
      await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]")).then(b => b.click());
      await driver.sleep(800);
      const player = await driver.findElement(By.css('[class*="bg-black"]'));
      expect(await player.isDisplayed()).toBe(true);
    });
  });

  // ─── Table View ─────────────────────────────────────────────────

  describe('Table View', () => {
    beforeEach(async () => {
      await ensureMenuClosed(driver);
      await driver.findElement(By.xpath("//button[contains(text(), 'Table')]")).then(b => b.click());
      await driver.sleep(500);
    });

    it('should render a table with shot rows', async () => {
      const rows = await driver.findElements(By.css('tr[data-shot-id]'));
      expect(rows.length).toBeGreaterThan(0);
    });

    it('should open Inspector when clicking View Details on a shot', async () => {
      const viewDetailsBtns = await driver.findElements(By.css('button[title="View details"]'));
      if (viewDetailsBtns.length > 0) {
        await viewDetailsBtns[0].click();
        await driver.sleep(500);
        const inspector = await driver.findElements(By.css('[data-testid="inspector"]'));
        expect(inspector.length).toBeGreaterThan(0);
      }
    });

    it('should not blank the screen when clicking rows', async () => {
      const rows = await driver.findElements(By.css('tr[data-shot-id]'));
      if (rows.length > 0) {
        await rows[0].click();
        await driver.sleep(300);
        const table = await driver.findElement(By.css('table'));
        expect(await table.isDisplayed()).toBe(true);
      }
    });
  });

  // ─── Storyboard View ───────────────────────────────────────────

  describe('Storyboard View', () => {
    beforeEach(async () => {
      await ensureMenuClosed(driver);
      await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]")).then(b => b.click());
      await driver.sleep(500);
    });

    it('should render shot cards', async () => {
      const cards = await driver.findElements(By.css('[data-card]'));
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should show draggable cards', async () => {
      const cards = await driver.findElements(By.css('[data-card][draggable="true"]'));
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should handle clicking on cards without blanking', async () => {
      const cards = await driver.findElements(By.css('[data-card]'));
      if (cards.length > 0) {
        await cards[0].click();
        await driver.sleep(300);
        const container = await driver.findElement(By.css('[class*="overflow"]'));
        expect(await container.isDisplayed()).toBe(true);
      }
    });

    it('should open Inspector when clicking a card', async () => {
      const cards = await driver.findElements(By.css('[data-card]'));
      if (cards.length > 0) {
        await cards[0].click();
        await driver.sleep(800);
        const inspector = await driver.findElements(By.css('[data-testid="inspector"]'));
        expect(inspector.length).toBeGreaterThan(0);
      }
    });
  });

  // ─── Animatics View ────────────────────────────────────────────

  describe('Animatics View', () => {
    beforeEach(async () => {
      await ensureMenuClosed(driver);
      await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]")).then(b => b.click());
      await driver.sleep(800);
    });

    it('should show video player area', async () => {
      const player = await driver.findElement(By.css('[class*="bg-black"]'));
      expect(await player.isDisplayed()).toBe(true);
    });

    it('should have zoom controls', async () => {
      const plusBtn = await driver.findElements(By.xpath("//button[text()='+']"));
      const minusBtn = await driver.findElements(By.xpath("//button[text()='\u2212']"));
      expect(plusBtn.length).toBeGreaterThanOrEqual(1);
      expect(minusBtn.length).toBeGreaterThanOrEqual(1);
    });

    it('should show zoom percentage', async () => {
      const hasZoom = await driver.executeScript(`
        const spans = document.querySelectorAll('span');
        for (const s of spans) {
          if (s.textContent && s.textContent.includes('%')) return true;
        }
        return false;
      `);
      expect(hasZoom).toBe(true);
    });

    it('should have timeline frames', async () => {
      const frames = await driver.findElements(By.css('[class*="cursor-move"]'));
      expect(frames.length).toBeGreaterThan(0);
    });

    it('should not blank when clicking timeline frames', async () => {
      const frames = await driver.findElements(By.css('[class*="cursor-move"]'));
      if (frames.length > 0) {
        await frames[0].click();
        await driver.sleep(300);
        const player = await driver.findElement(By.css('[class*="bg-black"]'));
        expect(await player.isDisplayed()).toBe(true);
      }
    });

    it('should have scrollbar-hidden time ruler', async () => {
      const hidden = await driver.findElements(By.css('[class*="scrollbar-hide"]'));
      expect(hidden.length).toBeGreaterThan(0);
    });
  });

  // ─── Three-dot Menu ─────────────────────────────────────────────

  describe('Three-dot Menu', () => {
    beforeEach(async () => {
      // Ensure we're in a clean view with no menu open
      await driver.findElement(By.xpath("//button[contains(text(), 'Table')]")).then(b => b.click());
      await driver.sleep(300);
      await ensureMenuClosed(driver);
    });

    it('should have a menu button', async () => {
      const menuBtn = await driver.findElement(By.css('button[title="Menu"]'));
      expect(await menuBtn.isDisplayed()).toBe(true);
    });

    it('should open menu on click', async () => {
      await openMenu(driver);
      const menuItems = await driver.findElements(
        By.xpath("//*[contains(@class, 'w-48')]//button[contains(text(), 'Project Details')]")
      );
      expect(menuItems.length).toBeGreaterThan(0);
      await ensureMenuClosed(driver);
    });

    it('should have Project Details option', async () => {
      const item = await openMenuAndFind(driver, 'Project Details');
      expect(await item.isDisplayed()).toBe(true);
      await ensureMenuClosed(driver);
    });

    it('should have Import option', async () => {
      const item = await openMenuAndFind(driver, 'Import');
      expect(await item.isDisplayed()).toBe(true);
      await ensureMenuClosed(driver);
    });

    it('should have Export option', async () => {
      const item = await openMenuAndFind(driver, 'Export');
      expect(await item.isDisplayed()).toBe(true);
      await ensureMenuClosed(driver);
    });

    it('should have Debug Mode toggle', async () => {
      const item = await openMenuAndFind(driver, 'Debug Mode');
      expect(await item.isDisplayed()).toBe(true);
      await ensureMenuClosed(driver);
    });

    it('should have GitHub link', async () => {
      await openMenu(driver);
      const link = await driver.findElement(
        By.xpath("//*[contains(@class, 'w-48')]//a[contains(text(), 'GitHub')]")
      );
      expect(await link.isDisplayed()).toBe(true);
      const href = await link.getAttribute('href');
      expect(href).toContain('github.com/shuffleo/storyboard-tool');
      const target = await link.getAttribute('target');
      expect(target).toBe('_blank');
      await ensureMenuClosed(driver);
    });

    it('should have Delete All Content option', async () => {
      const item = await openMenuAndFind(driver, 'Delete All Content');
      expect(await item.isDisplayed()).toBe(true);
      await ensureMenuClosed(driver);
    });

    it('should show Delete All confirmation dialog', async () => {
      const deleteBtn = await openMenuAndFind(driver, 'Delete All Content');
      await deleteBtn.click();
      await driver.sleep(500);

      const exportDelete = await driver.findElements(
        By.xpath("//button[contains(text(), 'Export and Delete')]")
      );
      const cancel = await driver.findElements(
        By.xpath("//button[text()='Cancel']")
      );

      expect(exportDelete.length).toBeGreaterThan(0);
      expect(cancel.length).toBeGreaterThan(0);

      const cancelBtn = cancel[cancel.length - 1];
      await cancelBtn.click();
      await driver.sleep(300);
    });
  });

  // ─── Project Details Modal ──────────────────────────────────────

  describe('Project Details Modal', () => {
    it('should open from menu', async () => {
      await driver.findElement(By.xpath("//button[contains(text(), 'Table')]")).then(b => b.click());
      await driver.sleep(300);
      const detailsBtn = await openMenuAndFind(driver, 'Project Details');
      await detailsBtn.click();
      await driver.sleep(500);

      const titleLabel = await driver.findElements(By.xpath("//*[contains(text(), 'TITLE') or contains(text(), 'Title')]"));
      expect(titleLabel.length).toBeGreaterThan(0);
    });

    it('should show FPS and Aspect Ratio fields', async () => {
      const fpsLabel = await driver.findElements(By.xpath("//*[contains(text(), 'FPS')]"));
      const aspectLabel = await driver.findElements(By.xpath("//*[contains(text(), 'ASPECT') or contains(text(), 'Aspect')]"));
      expect(fpsLabel.length).toBeGreaterThan(0);
      expect(aspectLabel.length).toBeGreaterThan(0);
    });

    it('should show Style Notes field', async () => {
      const label = await driver.findElements(By.xpath("//*[contains(text(), 'STYLE') or contains(text(), 'Style')]"));
      expect(label.length).toBeGreaterThan(0);
    });

    it('should show Global Notes field', async () => {
      const label = await driver.findElements(By.xpath("//*[contains(text(), 'GLOBAL') or contains(text(), 'Global')]"));
      expect(label.length).toBeGreaterThan(0);
    });

    it('should close with X button', async () => {
      const closeBtn = await driver.findElement(
        By.css('.modal-content button')
      );
      await closeBtn.click();
      await driver.sleep(300);

      const modals = await driver.findElements(By.css('.modal-content'));
      expect(modals.length).toBe(0);
    });

    it('should show folder path when projectFolderPath is set', async () => {
      await driver.executeScript(`
        window.__storyboardStore.setState({ projectFolderPath: '/Users/test/my-project' });
      `);
      await driver.sleep(300);

      const detailsBtn = await openMenuAndFind(driver, 'Project Details');
      await detailsBtn.click();
      await driver.sleep(500);

      const folderLabel = await driver.findElements(By.xpath("//*[contains(text(), 'FOLDER') or contains(text(), 'Folder')]"));
      expect(folderLabel.length).toBeGreaterThan(0);

      const folderPath = await driver.findElements(By.xpath("//*[contains(text(), '/Users/test/my-project')]"));
      expect(folderPath.length).toBeGreaterThan(0);

      // Close modal
      const closeBtn = await driver.findElement(By.css('.modal-content button'));
      await closeBtn.click();
      await driver.sleep(300);

      // Clean up
      await driver.executeScript(`
        window.__storyboardStore.setState({ projectFolderPath: null });
      `);
    });

    it('should not show folder path when projectFolderPath is null', async () => {
      const detailsBtn = await openMenuAndFind(driver, 'Project Details');
      await detailsBtn.click();
      await driver.sleep(500);

      const folderLabel = await driver.findElements(
        By.xpath("//label[contains(text(), 'FOLDER') or contains(text(), 'Folder')]")
      );
      expect(folderLabel.length).toBe(0);

      // Close modal
      const closeBtn = await driver.findElement(By.css('.modal-content button'));
      await closeBtn.click();
      await driver.sleep(300);
    });
  });

  // ─── Close Project ──────────────────────────────────────────────

  describe('Close Project', () => {
    it('should have Close Project option in menu', async () => {
      await driver.findElement(By.xpath("//button[contains(text(), 'Table')]")).then(b => b.click());
      await driver.sleep(300);
      const item = await openMenuAndFind(driver, 'Close Project');
      expect(await item.isDisplayed()).toBe(true);
      await ensureMenuClosed(driver);
    });

    it('should navigate to landing screen on close and return on internal storage', async () => {
      const closeBtn = await openMenuAndFind(driver, 'Close Project');
      await closeBtn.click();
      await driver.sleep(1000);

      // Should see the landing screen
      const heading = await driver.findElements(By.xpath("//h1[contains(text(), 'Storyboard')]"));
      const internalBtn = await driver.findElements(By.xpath("//button[contains(text(), 'Continue with Internal Storage')]"));
      const isLanding = heading.length > 0 || internalBtn.length > 0;
      expect(isLanding).toBe(true);

      // Go back to project view for remaining tests
      if (internalBtn.length > 0) {
        await internalBtn[0].click();
      } else {
        await driver.get(APP_URL);
      }
      await driver.wait(until.elementLocated(By.xpath("//button[contains(text(), 'Table')]")), 10000);
      await driver.sleep(500);
      await seedTestData(driver);
    });
  });

  // ─── Sync Status Indicator ─────────────────────────────────────

  describe('Sync Status Indicator', () => {
    it('should show sync status dot in menu when companion source', async () => {
      await driver.executeScript(`
        window.__storyboardStore.setState({ projectSource: 'companion', syncStatus: 'connected' });
      `);
      await driver.sleep(200);
      await openMenu(driver);

      const liveDot = await driver.findElements(By.xpath("//*[contains(text(), 'Live')]"));
      expect(liveDot.length).toBeGreaterThan(0);

      await ensureMenuClosed(driver);
      await driver.executeScript(`
        window.__storyboardStore.setState({ projectSource: 'none', syncStatus: 'disconnected' });
      `);
    });
  });

  // ─── Undo/Redo ─────────────────────────────────────────────────

  describe('Undo/Redo', () => {
    it('should have undo button', async () => {
      const undoBtn = await driver.findElement(By.css('button[title="Undo (Cmd+Z)"]'));
      expect(await undoBtn.isDisplayed()).toBe(true);
    });

    it('should have redo button', async () => {
      const redoBtn = await driver.findElement(By.css('button[title="Redo (Cmd+Shift+Z)"]'));
      expect(await redoBtn.isDisplayed()).toBe(true);
    });
  });

  // ─── Debug Mode ─────────────────────────────────────────────────

  describe('Debug Mode', () => {
    it('should toggle debug mode from menu', async () => {
      await driver.findElement(By.xpath("//button[contains(text(), 'Table')]")).then(b => b.click());
      await driver.sleep(300);
      const debugBtn = await openMenuAndFind(driver, 'Debug Mode');
      const text = await debugBtn.getText();
      await debugBtn.click();
      await driver.sleep(500);

      if (text.includes('Enable')) {
        const panel = await driver.findElements(By.xpath("//*[contains(text(), 'Debug Log')]"));
        expect(panel.length).toBeGreaterThan(0);
      }

      // Toggle back off
      const debugBtn2 = await openMenuAndFind(driver, 'Debug Mode');
      await debugBtn2.click();
      await driver.sleep(300);
    });
  });

  // ─── Inspector Panel ────────────────────────────────────────────

  describe('Inspector Panel', () => {
    beforeEach(async () => {
      await ensureMenuClosed(driver);
      await seedTestData(driver);
    });

    it('should open Inspector when clicking View Details in Table view', async () => {
      await driver.findElement(By.xpath("//button[contains(text(), 'Table')]")).then(b => b.click());
      await driver.sleep(500);

      const detailsBtns = await driver.findElements(By.css('button[title="View details"]'));
      expect(detailsBtns.length).toBeGreaterThan(0);
      await detailsBtns[0].click();
      await driver.sleep(800);

      const inspector = await driver.findElements(By.css('[data-testid="inspector"]'));
      expect(inspector.length).toBeGreaterThan(0);
    });

    it('should open Inspector when clicking card in Storyboard view', async () => {
      await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]")).then(b => b.click());
      await driver.sleep(800);

      const cards = await driver.findElements(By.css('[data-card]'));
      expect(cards.length).toBeGreaterThan(0);

      await driver.executeScript('arguments[0].click()', cards[0]);
      await driver.sleep(800);

      const inspector = await driver.findElements(By.css('[data-testid="inspector"]'));
      expect(inspector.length).toBeGreaterThan(0);
    });
  });

  // ─── Agent Editing Overlay ──────────────────────────────────────

  describe('Agent Editing Overlay', () => {
    it('should show overlay when agentEditing is true', async () => {
      await driver.findElement(By.xpath("//button[contains(text(), 'Table')]")).then(b => b.click());
      await driver.sleep(300);

      await driver.executeScript(`
        window.__storyboardStore.setState({ agentEditing: true });
      `);
      await driver.sleep(300);

      const overlayText = await driver.findElements(
        By.xpath("//*[contains(text(), 'Agent is editing')]")
      );
      expect(overlayText.length).toBeGreaterThan(0);
    });

    it('should block interaction with pointer-events', async () => {
      const hasPointerEvents = await driver.executeScript(`
        const el = document.querySelector('[style*="pointer-events"]');
        return el !== null;
      `);
      expect(hasPointerEvents).toBe(true);
    });

    it('should show subtitle text', async () => {
      const subtitle = await driver.findElements(
        By.xpath("//*[contains(text(), 'Changes will appear')]")
      );
      expect(subtitle.length).toBeGreaterThan(0);
    });

    it('should hide overlay when agentEditing is false', async () => {
      await driver.executeScript(`
        window.__storyboardStore.setState({ agentEditing: false });
      `);
      await driver.sleep(300);

      const overlayText = await driver.findElements(
        By.xpath("//*[contains(text(), 'Agent is editing')]")
      );
      expect(overlayText.length).toBe(0);
    });
  });

  // ─── Import/Export Modals ───────────────────────────────────────

  describe('Import/Export Modals', () => {
    beforeEach(async () => {
      await driver.findElement(By.xpath("//button[contains(text(), 'Table')]")).then(b => b.click());
      await driver.sleep(300);
      await ensureMenuClosed(driver);
    });

    it('should open Import modal', async () => {
      const importBtn = await openMenuAndFind(driver, 'Import');
      await importBtn.click();
      await driver.sleep(500);

      const csvBtn = await driver.findElements(By.xpath("//button[text()='CSV']"));
      const zipBtn = await driver.findElements(By.xpath("//button[text()='ZIP']"));
      expect(csvBtn.length).toBeGreaterThan(0);
      expect(zipBtn.length).toBeGreaterThan(0);

      const cancelBtns = await driver.findElements(By.xpath("//button[text()='Cancel']"));
      if (cancelBtns.length > 0) {
        await cancelBtns[cancelBtns.length - 1].click();
        await driver.sleep(300);
      }
    });

    it('should open Export modal', async () => {
      const exportBtn = await openMenuAndFind(driver, 'Export');
      await exportBtn.click();
      await driver.sleep(500);

      const csvBtn = await driver.findElements(By.xpath("//button[text()='CSV']"));
      const pdfBtn = await driver.findElements(By.xpath("//button[contains(text(), 'PDF')]"));
      expect(csvBtn.length).toBeGreaterThan(0);
      expect(pdfBtn.length).toBeGreaterThan(0);

      const cancelBtns = await driver.findElements(By.xpath("//button[text()='Cancel']"));
      if (cancelBtns.length > 0) {
        await cancelBtns[cancelBtns.length - 1].click();
        await driver.sleep(300);
      }
    });
  });

  // ─── Data Integrity After Navigation ────────────────────────────

  describe('Data Integrity', () => {
    it('should preserve shots across view switches', async () => {
      await driver.findElement(By.xpath("//button[contains(text(), 'Table')]")).then(b => b.click());
      await driver.sleep(500);
      const countBefore = (await driver.findElements(By.css('tr[data-shot-id]'))).length;

      await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]")).then(b => b.click());
      await driver.sleep(500);
      await driver.findElement(By.xpath("//button[contains(text(), 'Animatics')]")).then(b => b.click());
      await driver.sleep(500);
      await driver.findElement(By.xpath("//button[contains(text(), 'Table')]")).then(b => b.click());
      await driver.sleep(500);

      const countAfter = (await driver.findElements(By.css('tr[data-shot-id]'))).length;
      expect(countAfter).toBe(countBefore);
    });

    it('should reflect shot count consistently in Storyboard view', async () => {
      await driver.findElement(By.xpath("//button[contains(text(), 'Table')]")).then(b => b.click());
      await driver.sleep(500);
      const tableCount = (await driver.findElements(By.css('tr[data-shot-id]'))).length;

      await driver.findElement(By.xpath("//button[contains(text(), 'Storyboard')]")).then(b => b.click());
      await driver.sleep(500);
      const cardCount = (await driver.findElements(By.css('[data-card]'))).length;

      expect(cardCount).toBe(tableCount);
    });
  });
});
