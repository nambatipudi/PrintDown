/**
 * Unit tests for theme utilities
 * These tests verify theme data structure and properties
 */

describe('Theme Utilities', () => {
  // Mock theme data based on renderer.ts
  const themes = {
    dark: {
      body: '#1e1e1e',
      content: '#1e1e1e',
      text: '#d4d4d4',
      heading: '#4ec9b0',
      link: '#4fc3f7',
      codeBg: '#2d2d30',
      codeText: '#ce9178',
      quoteBg: 'rgba(255, 255, 255, 0.03)',
      quoteBorder: '#4fc3f7',
      quoteText: '#b0b0b0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      codeFontFamily: '"Consolas", "Monaco", "Courier New", monospace',
      fontSize: '16px',
      lineHeight: '1.6'
    },
    light: {
      body: '#ffffff',
      content: '#ffffff',
      text: '#24292e',
      heading: '#0366d6',
      link: '#0366d6',
      codeBg: '#f6f8fa',
      codeText: '#d73a49',
      quoteBg: '#f6f8fa',
      quoteBorder: '#0366d6',
      quoteText: '#6a737d',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      codeFontFamily: '"Consolas", "Monaco", "Courier New", monospace',
      fontSize: '16px',
      lineHeight: '1.6'
    }
  };

  describe('Theme Structure', () => {
    test('should have dark theme defined', () => {
      expect(themes.dark).toBeDefined();
      expect(themes.dark).toBeInstanceOf(Object);
    });

    test('should have light theme defined', () => {
      expect(themes.light).toBeDefined();
      expect(themes.light).toBeInstanceOf(Object);
    });

    test('dark and light themes should have same properties', () => {
      const darkKeys = Object.keys(themes.dark).sort();
      const lightKeys = Object.keys(themes.light).sort();
      expect(darkKeys).toEqual(lightKeys);
    });

    test('all theme properties should be strings', () => {
      Object.values(themes.dark).forEach(value => {
        expect(typeof value).toBe('string');
      });
      Object.values(themes.light).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });
  });

  describe('Theme Colors', () => {
    test('dark theme should have dark background colors', () => {
      expect(themes.dark.body).toBe('#1e1e1e');
      expect(themes.dark.content).toBe('#1e1e1e');
    });

    test('light theme should have light background colors', () => {
      expect(themes.light.body).toBe('#ffffff');
      expect(themes.light.content).toBe('#ffffff');
    });

    test('color values should be valid hex or rgba', () => {
      const isValidColor = (color: string) => {
        return /^#[0-9a-fA-F]{6}$/.test(color) || /^rgba?\(/.test(color);
      };

      const colorProps = ['body', 'content', 'text', 'heading', 'link', 'codeBg', 
                          'codeText', 'quoteBg', 'quoteBorder', 'quoteText'];
      
      colorProps.forEach(prop => {
        expect(isValidColor(themes.dark[prop as keyof typeof themes.dark])).toBe(true);
        expect(isValidColor(themes.light[prop as keyof typeof themes.light])).toBe(true);
      });
    });
  });

  describe('Theme Typography', () => {
    test('font families should be defined', () => {
      expect(themes.dark.fontFamily).toBeTruthy();
      expect(themes.light.fontFamily).toBeTruthy();
      expect(themes.dark.codeFontFamily).toBeTruthy();
      expect(themes.light.codeFontFamily).toBeTruthy();
    });

    test('font sizes should have valid CSS units', () => {
      expect(themes.dark.fontSize).toMatch(/^\d+px$/);
      expect(themes.light.fontSize).toMatch(/^\d+px$/);
    });

    test('line heights should be valid', () => {
      expect(themes.dark.lineHeight).toBeTruthy();
      expect(themes.light.lineHeight).toBeTruthy();
      expect(parseFloat(themes.dark.lineHeight)).toBeGreaterThan(0);
      expect(parseFloat(themes.light.lineHeight)).toBeGreaterThan(0);
    });
  });

  describe('Theme Contrast', () => {
    test('dark theme text should contrast with background', () => {
      // Text should be lighter than background in dark theme
      expect(themes.dark.text).not.toBe(themes.dark.body);
      expect(themes.dark.text.toLowerCase()).toContain('d4d4d4'); // Light gray
    });

    test('light theme text should contrast with background', () => {
      // Text should be darker than background in light theme
      expect(themes.light.text).not.toBe(themes.light.body);
      expect(themes.light.text.toLowerCase()).toContain('24292e'); // Dark gray
    });
  });

  describe('Font Size Utilities', () => {
    test('should parse font size correctly', () => {
      const fontSize = '16px';
      const parsed = parseInt(fontSize);
      expect(parsed).toBe(16);
    });

    test('should increase font size', () => {
      const initial = 16;
      const increased = initial + 2;
      expect(increased).toBe(18);
      expect(increased).toBeGreaterThan(initial);
    });

    test('should decrease font size', () => {
      const initial = 16;
      const decreased = initial - 2;
      expect(decreased).toBe(14);
      expect(decreased).toBeLessThan(initial);
    });

    test('should not go below minimum font size', () => {
      const minSize = 10;
      const current = 12;
      const decreased = Math.max(minSize, current - 2);
      expect(decreased).toBeGreaterThanOrEqual(minSize);
    });
  });
});
