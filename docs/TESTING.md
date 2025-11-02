# Testing Guide for PrintDown

This document describes the testing strategy and how to run tests for PrintDown.

## Overview

PrintDown uses a multi-layered testing approach to ensure quality:

1. **Unit Tests** - Test individual functions and utilities in isolation
2. **Integration Tests (E2E)** - Test complete user workflows in the Electron app
3. **Visual Regression Tests** - Verify rendering consistency with screenshot comparison

## Test Structure

```
tests/
├── unit/               # Unit tests for utilities and functions
│   └── theme-utils.test.ts
├── e2e/                # End-to-end integration tests
│   └── app.e2e.ts
├── visual/             # Visual regression tests
│   └── theme-screenshots.test.ts
├── fixtures/           # Test data files
│   └── test-document.md
├── helpers/            # Shared test utilities
│   └── screenshot-compare.ts
└── visual-baselines/   # Baseline screenshots for comparison
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### E2E Tests Only
```bash
npm run test:e2e
```

### E2E Tests with UI (Headed Mode)
```bash
npm run test:e2e:headed
```

### E2E Tests with Debugger
```bash
npm run test:e2e:debug
```

## Test Categories

### 1. Unit Tests (`tests/unit/`)

Unit tests verify individual functions and utilities work correctly in isolation.

**What we test:**
- Theme data structure and properties
- Color value validation (hex, rgba)
- Typography settings (font families, sizes, line heights)
- Theme contrast verification
- Font size manipulation utilities

**Example:**
```typescript
test('should increase font size', () => {
  const initial = 16;
  const increased = initial + 2;
  expect(increased).toBe(18);
  expect(increased).toBeGreaterThan(initial);
});
```

**Why unit tests:**
- Fast execution
- Easy to debug
- Test edge cases
- No need for full app initialization

### 2. Integration Tests (E2E) (`tests/e2e/`)

End-to-end tests verify complete user workflows in the real Electron application.

**What we test:**
- App launches successfully
- Window becomes visible
- Files can be opened
- Markdown is rendered correctly
- TOC (Table of Contents) toggle works
- Theme switching works
- Font size changes apply
- Math equations render with MathJax
- User interactions flow correctly

**Example:**
```typescript
test('should open and render markdown file', async () => {
  await electronApp.evaluate(async ({ app }, filePath) => {
    const { BrowserWindow } = require('electron');
    const mainWindow = BrowserWindow.getAllWindows()[0];
    mainWindow.webContents.send('open-file', filePath);
  }, testFile);

  await window.waitForTimeout(2000);
  
  const content = window.locator('#markdown-content');
  await expect(content).toBeVisible();
});
```

**Why E2E tests:**
- Test real user scenarios
- Verify IPC communication between main and renderer processes
- Ensure all components work together
- Catch integration issues

### 3. Visual Regression Tests (`tests/visual/`)

Visual tests capture screenshots and compare them against baseline images to detect unintended visual changes.

**What we test:**
- Dark theme appearance
- Light theme appearance
- TOC expanded state
- Math equation rendering
- Code block syntax highlighting
- Overall layout consistency

**How it works:**
1. First run creates baseline screenshots (stored in `tests/visual-baselines/`)
2. Subsequent runs compare current screenshots against baselines
3. If differences exceed threshold (1%), test fails
4. Diff images show exactly what changed (saved in `test-results/screenshots/`)

**Example:**
```typescript
test('should match dark theme screenshot', async () => {
  const screenshot = await window.screenshot({ 
    path: path.join(screenshotsPath, 'dark-theme.png'),
    fullPage: false 
  });

  const mismatchPercentage = await compareScreenshots(
    baselineFile,
    screenshot,
    diffPath
  );
  
  expect(mismatchPercentage).toBeLessThan(1);
});
```

**Why visual tests:**
- Detect CSS regressions
- Verify theme changes don't break layout
- Ensure consistent rendering across changes
- Catch subtle visual bugs

## How to Verify Rendering Correctness

### Markdown Elements

**Test approach:**
1. Create fixture markdown files with all supported elements
2. Use E2E tests to open the file and verify elements exist
3. Use visual tests to verify elements render correctly

**What to check:**
```typescript
// Headings exist
const h1 = window.locator('h1');
await expect(h1).toBeVisible();

// Code blocks have syntax highlighting
const codeBlock = window.locator('pre code');
await expect(codeBlock).toHaveClass(/language-/);

// Links are clickable
const links = window.locator('a');
expect(await links.count()).toBeGreaterThan(0);

// Tables render
const tables = window.locator('table');
expect(await tables.count()).toBeGreaterThan(0);
```

### Theme Application

**Test approach:**
1. Change theme via IPC message
2. Verify computed styles match theme definition
3. Compare screenshot against baseline

**What to check:**
```typescript
// Send theme change
await electronApp.evaluate(async ({ app }) => {
  const { BrowserWindow } = require('electron');
  const mainWindow = BrowserWindow.getAllWindows()[0];
  mainWindow.webContents.send('menu-theme-change', 'dark');
});

// Verify background color
const contentDiv = window.locator('#content');
const bgColor = await contentDiv.evaluate((el: HTMLElement) => 
  getComputedStyle(el).backgroundColor
);
expect(bgColor).toBe('rgb(30, 30, 30)'); // #1e1e1e in RGB
```

### TOC (Table of Contents)

**Test approach:**
1. Click TOC toggle button
2. Verify sidebar visibility changes
3. Verify TOC items match headings

**What to check:**
```typescript
const tocSidebar = window.locator('#toc-sidebar');
const tocToggle = window.locator('#toc-toggle');

// Get initial state
const initialDisplay = await tocSidebar.evaluate((el: HTMLElement) => 
  getComputedStyle(el).display
);

// Click toggle
await tocToggle.click();

// Verify state changed
const newDisplay = await tocSidebar.evaluate((el: HTMLElement) => 
  getComputedStyle(el).display
);
expect(newDisplay).not.toBe(initialDisplay);
```

### Font Sizes

**Test approach:**
1. Send font size change message
2. Get computed font size before and after
3. Verify size increased/decreased correctly

**What to check:**
```typescript
const contentDiv = window.locator('#markdown-content');

// Get initial size
const initialFontSize = await contentDiv.evaluate((el: HTMLElement) => 
  getComputedStyle(el).fontSize
);

// Increase font size
await electronApp.evaluate(async ({ app }) => {
  const { BrowserWindow } = require('electron');
  const mainWindow = BrowserWindow.getAllWindows()[0];
  mainWindow.webContents.send('menu-font-increase');
});

// Get new size
const newFontSize = await contentDiv.evaluate((el: HTMLElement) => 
  getComputedStyle(el).fontSize
);

const initialSize = parseFloat(initialFontSize);
const newSize = parseFloat(newFontSize);
expect(newSize).toBeGreaterThan(initialSize);
```

### Pagination

**Test approach:**
1. Enable pagination
2. Verify paged.js classes are applied
3. Check page containers exist
4. Verify content flows across pages

**What to check:**
```typescript
// Check if pagination applied
const pagesContainer = window.locator('.pagedjs_pages');
await expect(pagesContainer).toBeVisible();

// Check if pages created
const pages = window.locator('.pagedjs_page');
const pageCount = await pages.count();
expect(pageCount).toBeGreaterThan(0);

// Verify content is in pages
const pageContent = window.locator('.pagedjs_page_content');
expect(await pageContent.count()).toBe(pageCount);
```

## Writing New Tests

### Adding Unit Tests

1. Create a new file in `tests/unit/` with `.test.ts` extension
2. Import the function/utility you want to test
3. Write test cases using Jest syntax
4. Run `npm run test:unit` to verify

### Adding E2E Tests

1. Add test cases to `tests/e2e/app.e2e.ts`
2. Use `electronApp` to control the app
3. Use `window` to interact with the renderer
4. Use `evaluate()` to run code in the browser context
5. Run `npm run test:e2e` to verify

### Adding Visual Tests

1. Add test cases to `tests/visual/theme-screenshots.test.ts`
2. Take screenshots of the UI state you want to verify
3. First run creates baselines
4. Subsequent runs compare against baselines
5. Run `npm run test:e2e` to verify (visual tests use Playwright)

## Continuous Integration

When setting up CI/CD:

```yaml
- name: Run tests
  run: |
    npm run build
    npm run test:unit
    npm run test:e2e
```

For visual tests, you may want to:
- Store baselines in the repository
- Run in headless mode
- Upload diff images as artifacts when tests fail

## Debugging Test Failures

### Unit Test Failures
```bash
npm run test:unit -- --verbose
```

### E2E Test Failures
```bash
# Run with UI visible
npm run test:e2e:headed

# Or use the debugger
npm run test:e2e:debug
```

Playwright will automatically:
- Save screenshots on failure
- Save video recordings
- Save trace files for debugging

Check `test-results/` directory for artifacts.

### Visual Test Failures

When a visual test fails:
1. Check the diff image in `test-results/screenshots/`
2. The diff highlights changed pixels in red
3. Decide if the change is intentional:
   - If intentional: Update baseline by copying new screenshot to `tests/visual-baselines/`
   - If bug: Fix the code and re-run tests

## Best Practices

1. **Keep tests focused** - Each test should verify one thing
2. **Use descriptive names** - Test names should explain what they verify
3. **Avoid flaky tests** - Add appropriate waits for async operations
4. **Test real scenarios** - E2E tests should mirror actual user workflows
5. **Update baselines carefully** - Visual regression baselines should only change intentionally
6. **Test edge cases** - Unit tests should cover boundary conditions
7. **Keep fixtures minimal** - Test files should have just enough content to verify functionality

## Test Coverage

To generate coverage reports:

```bash
npm run test:unit -- --coverage
```

Coverage reports will be in `coverage/` directory.

## Troubleshooting

### Electron app won't launch in tests
- Ensure the app builds successfully: `npm run build`
- Check that `dist/main.js` exists
- Verify Electron version compatibility

### Screenshots don't match
- Font rendering can vary between systems
- Set threshold appropriately (0.5-1% tolerance)
- Use consistent test environment (same OS, same resolution)

### Tests timeout
- Increase timeout in `playwright.config.ts`
- Add more `waitForTimeout()` calls for async operations
- Check if app is actually loading

### Math equations not rendering
- Ensure MathJax loads completely
- Add longer wait times for heavy rendering
- Check console for JavaScript errors
