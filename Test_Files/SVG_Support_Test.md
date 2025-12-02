# SVG Support Test

PrintDown supports SVG (Scalable Vector Graphics) in multiple ways:

## 1. External SVG Files (via Image Syntax)

You can reference external SVG files using standard markdown image syntax:

![Example SVG](test-icon.svg)

The image will be loaded and displayed just like PNG/JPG images.

## 2. Inline SVG (Raw HTML)

You can also embed SVG directly in your markdown:

<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="80" fill="#4CAF50" />
  <text x="100" y="110" font-size="24" text-anchor="middle" fill="white" font-weight="bold">
    SVG
  </text>
</svg>

## 3. Complex Inline SVG Example

<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="300" height="200" fill="#f0f0f0" />
  
  <!-- Gradient definition -->
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Rectangle with gradient -->
  <rect x="50" y="50" width="200" height="100" rx="10" fill="url(#grad1)" />
  
  <!-- Text -->
  <text x="150" y="105" font-size="20" text-anchor="middle" fill="white" font-weight="bold">
    PrintDown
  </text>
</svg>

## 4. Interactive SVG

SVG can include animations and interactivity:

<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="50" fill="#2196F3">
    <animate attributeName="r" from="50" to="70" dur="1s" repeatCount="indefinite" />
  </circle>
  <text x="100" y="110" font-size="16" text-anchor="middle" fill="white">
    Pulsing
  </text>
</svg>

## 5. Data URI SVG

You can also use data URIs:

![Data URI SVG](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iI0ZGOTgwMCIvPjwvc3ZnPg==)

## Notes

- External SVG files are loaded via the `printdown://` protocol (same as other images)
- Inline SVG has full access to CSS and can be styled with your document theme
- SVG images support the same resizing controls as PNG/JPG images
- Animations and interactivity work in the viewer (but not in PDF exports)
