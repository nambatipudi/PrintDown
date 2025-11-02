# Testing Implementation Summary

## What Was Added

### 1. Testing Infrastructure
- **Jest** - For unit testing utilities and functions
- **Playwright** - For E2E testing of the Electron app
- **Pixelmatch & pngjs** - For visual regression testing

### 2. Test Files Created

#### Unit Tests (`tests/unit/`)
- `theme-utils.test.ts` - Tests for theme structure, colors, typography, and font size utilities
  - 16 tests covering theme validation
  - All tests passing ✅

#### E2E Tests (`tests/e2e/`)
- `app.e2e.ts` - End-to-end tests for app functionality
  - App launch and window visibility
  - File opening and markdown rendering
  - TOC toggle functionality
  - Theme switching
  - Font size changes
  - Math equation rendering

- `visual.test.ts` - Visual regression tests
  - Dark theme screenshot comparison
  - Light theme screenshot comparison
  - TOC expanded state
  - Math rendering verification
  - Code block rendering

#### Test Helpers (`tests/helpers/`)
- `screenshot-compare.ts` - Utility for comparing screenshots using pixelmatch
  - Compares baseline vs current screenshots
  - Generates diff images
  - Returns mismatch percentage

#### Test Fixtures (`tests/fixtures/`)
- `test-document.md` - Sample markdown with all supported features
  - Headings (H1-H6)
  - Code blocks with syntax highlighting
  - Math equations (inline and display)
  - Lists (ordered and unordered)
  - Tables
  - Links and emphasis

### 3. Configuration Files

#### `jest.config.js`
- TypeScript support via ts-jest
- Tests located in `tests/unit/` directory
- Coverage collection from `src/` directory
- HTML and LCOV coverage reports

#### `playwright.config.ts`
- Electron-specific configuration
- Tests in `tests/e2e/` directory
- Screenshot and trace capture on failure
- Reasonable timeouts for Electron app startup

### 4. NPM Scripts

Added to `package.json`:
```json
{
  "test": "npm run test:unit && npm run test:e2e",
  "test:unit": "jest",
  "test:e2e": "playwright test",
  "test:e2e:headed": "playwright test --headed",
  "test:e2e:debug": "playwright test --debug"
}
```

### 5. Documentation

#### `docs/TESTING.md` - Comprehensive testing guide
- Overview of testing strategy
- How to run tests
- Test categories explained (Unit, E2E, Visual)
- How to verify rendering correctness
- Writing new tests
- Debugging test failures
- Best practices
- Troubleshooting

## Test Results

### Unit Tests
✅ **All 16 tests passing**

```
Test Suites: 1 passed, 1 total
Tests:       16 passed, 16 total
Time:        1.098 s
```

Tests cover:
- Theme data structure validation
- Color format verification (hex and rgba)
- Typography settings (fonts, sizes, line heights)
- Theme contrast verification
- Font size manipulation logic

### E2E Tests
📝 **Ready to run** (requires `npm run build` first)

Tests verify:
- Electron app launches successfully
- Markdown files can be opened
- Content renders correctly
- UI interactions work (TOC toggle, theme changes, font size)
- MathJax equations render
- All user workflows function end-to-end

### Visual Regression Tests
📝 **Ready to run** (will create baselines on first run)

Tests verify:
- Theme appearances match baselines
- TOC display is consistent
- Math and code rendering is pixel-perfect
- No unintended visual regressions

## How to Use

### Run All Tests
```bash
npm test
```

### Run Only Unit Tests (Fast)
```bash
npm run test:unit
```

### Run E2E Tests
```bash
# Build first
npm run build

# Run tests
npm run test:e2e

# Or with visible UI
npm run test:e2e:headed

# Or with debugger
npm run test:e2e:debug
```

### Generate Coverage Report
```bash
npm run test:unit -- --coverage
```

Report will be in `coverage/index.html`

## Next Steps

### Before Running E2E Tests
1. Build the application: `npm run build`
2. Ensure `dist/main.js` exists
3. Run tests: `npm run test:e2e`

### First Time Running Visual Tests
On first run, visual tests will:
1. Create baseline screenshots in `tests/visual-baselines/`
2. Pass all tests (no baselines to compare against)
3. Use these baselines for future comparisons

Subsequent runs will:
1. Compare against baselines
2. Fail if mismatch > 1%
3. Save diff images showing changes

### Updating Visual Baselines
When you intentionally change styling:
1. Run visual tests (they will fail)
2. Check diff images in `test-results/screenshots/`
3. If changes look correct, copy new screenshots to `tests/visual-baselines/`
4. Re-run tests to verify they pass

## Testing Strategy

### What Gets Tested

1. **Unit Tests** (Fast, isolated)
   - Theme utilities and data structures
   - Font size calculations
   - Color validation
   - Any pure functions

2. **Integration Tests / E2E** (Realistic, comprehensive)
   - Complete user workflows
   - IPC communication
   - File opening and rendering
   - UI interactions
   - Feature integration

3. **Visual Regression** (Pixel-perfect, catch regressions)
   - Theme appearances
   - Layout consistency
   - Rendering quality
   - CSS changes

### What To Assert

#### Rendering Correctness
- **Existence**: Element exists in DOM
- **Visibility**: Element is visible (not `display: none`)
- **Content**: Text/HTML matches expected
- **Structure**: Proper parent-child relationships
- **Styling**: Computed styles match theme
- **Visual**: Screenshot matches baseline

#### Theme Application
- Background colors match theme definition
- Text colors have proper contrast
- Font families applied correctly
- All theme properties reflected in DOM

#### TOC Functionality
- TOC items match document headings
- Toggle button changes visibility
- Clicking TOC items scrolls to sections
- Active item highlights current section

#### Font Sizes
- Font size increases/decreases by expected amount
- Changes persist across sessions
- Minimum/maximum bounds respected

#### Pagination
- Page containers created by paged.js
- Content flows across pages correctly
- Page breaks respect rules
- Headers/footers render on each page

## Troubleshooting

### "Cannot find module" errors
- Run `npm install` to ensure all dependencies installed
- Check that `@types/*` packages are present

### Tests timeout
- Increase timeout in `playwright.config.ts`
- Add more `waitForTimeout()` calls
- Check if app is actually building/loading

### Visual tests always fail
- Font rendering varies between systems
- Run tests on same OS as baseline creation
- Increase tolerance threshold if needed
- Use Docker for consistent environment in CI

### Electron app won't launch
- Build app first: `npm run build`
- Check `dist/main.js` exists
- Verify Electron version compatibility
- Check console for errors

## Additional Resources

- [Jest Documentation](https://jestjs.io/)
- [Playwright Documentation](https://playwright.dev/)
- [Playwright Electron](https://playwright.dev/docs/api/class-electron)
- [Pixelmatch](https://github.com/mapbox/pixelmatch)
- Full testing guide: See `docs/TESTING.md`
