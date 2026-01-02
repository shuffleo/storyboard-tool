# Test Suite

This directory contains comprehensive test cases for the Storyboard Tool application.

## Test Structure

- `unit/` - Unit tests for individual components and utilities
- `integration/` - Integration tests for feature workflows
- `e2e/` - End-to-end test scenarios with Selenium WebDriver

## Running Tests

```bash
# Unit and integration tests
npm test

# E2E tests with Selenium (requires dev server running)
npm run dev  # In one terminal
npm run test:e2e  # In another terminal
```

## Test Coverage

The test suite covers:

1. **Data Model Tests**
   - Shot creation with duration field (min 300ms)
   - Scene creation with automatic shot creation
   - Shot deletion with scene deletion logic
   - Data persistence and loading

2. **UI Component Tests**
   - TableView text field sizing and behavior
   - TableView Actions column heading hidden
   - StoryboardView compact mode (4 columns)
   - StoryboardView drag-and-drop reordering with scene dimming
   - StoryboardView Add Shot/Scene buttons hidden
   - Dark theme application
   - Inspector panel duration field display
   - Inspector panel shot code in header
   - Inspector panel image carousel with delete and set main
   - Inspector panel close button hidden in Animatics view

3. **Animatics View Tests**
   - Timeline frame rendering
   - Playback controls
   - Inspector panel (replaces script panel)
   - Frame duration editing
   - Image error handling for corrupted images
   - Timeline zoom and scrollbar synchronization
   - Video restart from beginning
   - Shot reordering with scene dimming
   - Keyboard shortcuts (spacebar, arrow keys)

4. **Import/Export Tests**
   - JSON import/export
   - CSV import/export with duration field
   - PDF export with images
   - ZIP archive handling

5. **Import/Export Tests (continued)**
   - IndexedDB import/export
   - WebM video export

6. **Delete All Content Tests**
   - Confirmation dialog with three options
   - Reset to default project state
   - Export before delete option

7. **E2E Tests (Selenium)**
   - Click handling in Animatics view (empty cards, cards with images, empty image areas)
   - Click handling in Storyboard view (empty cards, thumbnail areas)
   - Click handling in Table view (table rows)
   - UI element visibility verification
   - Error handling for corrupted images
   - Inspector panel behavior
   - Blank screen prevention tests

## Test Requirements

All tests should verify:
- Default project initialization (3 scenes, 5 shots each)
- Duration field minimum value (300ms)
- Dark theme consistency (neutral grayscale)
- Text field size consistency
- Storyboard compact view column count (4)
- Animatics view functionality
- Image error handling
- Drag-and-drop reordering with scene dimming
- Inspector panel improvements
- Timeline zoom and scrollbar sync
- Keyboard shortcuts in Animatics view
- Delete All Content functionality

## Setup

### Unit and Integration Tests

Test framework (Vitest) needs to be set up. Install with:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

### E2E Tests with Selenium

E2E tests use Selenium WebDriver for browser automation. Install with:
```bash
npm install -D selenium-webdriver vitest
```

**Requirements:**
- Chrome browser installed
- ChromeDriver (can be installed via `npm install -g chromedriver` or use webdriver-manager)
- Dev server running on `http://localhost:5173` (or update baseUrl in test file)
- Selenium WebDriver: `npm install -D selenium-webdriver`

**Running E2E Tests:**
1. Start dev server: `npm run dev`
2. In another terminal, run: `npm run test:e2e`

**E2E Test Coverage:**
- Click handling in all views (Animatics, Storyboard, Table)
- Empty card/image area clicks
- UI element visibility
- Error handling for corrupted images
- Inspector panel behavior
- Scrollbar visibility and sync
- Delete All Content dialog
- Drag and drop functionality
- Timeline zoom controls

**Note:** E2E tests verify actual UI interactions and can catch bugs like blank screens, click handler errors, and visual regressions that unit tests might miss.

