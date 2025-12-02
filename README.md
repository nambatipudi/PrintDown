# PrintDown

Feature-rich Markdown viewer and PDF exporter built with Electron.

## Screenshots

### Mermaid Diagrams & Math Support
![Gantt Chart, Git Graph, and Math Equations](./docs/screenshots/diagrams-math.png)
*Render Gantt charts, Git graphs, and mathematical equations seamlessly in your Markdown documents*

### Mermaid Sequence Diagrams
![Mermaid Sequence Diagrams](./docs/screenshots/sequence-diagrams.png)
*Create professional sequence diagrams showing user authentication flows and API interactions*

### Multiple Themes
![Theme Selection](./docs/screenshots/themes.png)
*Choose from 16+ beautiful themes including Dark, Light, Academic, and more*

## Features

### Markdown Support
- Live preview of Markdown files
- Support for CommonMark and GitHub Flavored Markdown
- Multiple file tabs for easy switching between documents
- **NEW: Table of Contents (TOC) Sidebar** - Navigate long documents with collapsible heading tree

### Navigation & Interface
- **Collapsible TOC Sidebar** - Click the ☰ hamburger button to toggle
- **Smart heading navigation** - Click any heading in TOC to scroll smoothly
- **Active section highlighting** - Current section highlighted in TOC
- **Keyboard shortcuts** - Ctrl/Cmd + \ to toggle TOC
- **Right-click tab context menu** - Close, Close Others, Close All options
- **Enhanced drag & drop** - Visual feedback and multi-file support

### Customizable Themes
Choose from 16+ themes *(see theme dropdown screenshot above)*:

### Math Equations
Full support for mathematical notation using **MathJax 3** *(see first screenshot above)*:
- **Inline math**: `$E = mc^2$` renders as $E = mc^2$
- **Display math**: Complex integrals like `$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$`
- LaTeX commands and symbols
- Chemistry equations with mhchem
- Automatic rendering in both light and dark themes

### Diagrams
Render complex diagrams directly in your Markdown:

**Mermaid Diagrams** *(see screenshots above)*:
- **Flowcharts** - Decision trees and process flows
- **Sequence diagrams** - User authentication, API interactions
- **Class diagrams** - UML class structures
- **State diagrams** - State machines
- **Gantt charts** - Project timelines and schedules
- **Git graphs** - Repository branch visualization
- **Pie charts** - Data visualization

### Font Size Control
- Adjustable font size with +/- buttons
- Smooth scaling from 50% to 200%
- Reset button to return to default
- Persistent across sessions and respected by PDF export

### Image & SVG Support
- **Multiple image formats**: PNG, JPG, GIF, WebP, and **SVG**
- **External SVG files**: Reference SVG files using `![alt](image.svg)` syntax
- **Inline SVG**: Embed SVG code directly in your Markdown (HTML support enabled)
- **Per-image resizing**: Hover to see handle, drag to resize, double-click to reset
- **Aspect ratio preservation**: Images maintain proportions when resized
- Sizes persist per file and are honored by PDF export

### PDF Export
Export your Markdown to PDFs:

### Performance & Reliability
- **Completely offline** - No CDN dependencies, works without internet
- **Local vendor scripts** - MathJax, Mermaid, and all libraries bundled locally
- **System fonts** - Uses high-quality system fonts (no Google Fonts dependency)
- **Electron 39** - Latest Electron with modern security and performance

### Session Management
- Automatically saves open files
- Restores tabs on app restart
- Remembers theme and font size preferences
- **TOC state persistence** - Remembers if sidebar was open/closed

## What's New in v1.3.0 🎉

### Major Features Added:
- **🧭 Table of Contents Sidebar** - Navigate long documents with collapsible heading tree
- **⚡ Completely Offline** - Removed all CDN dependencies for true offline functionality
- **🔧 Enhanced UI** - Moved font/theme controls to main menu for cleaner interface
- **📝 Better Math Support** - Improved parenthetical math expressions like `(a + b)` 
- **🖱️ Tab Context Menu** - Right-click tabs for Close, Close Others, Close All options
- **⬆️ Electron 39** - Latest Electron with modern security and performance

### Technical Improvements:
- Local vendor scripts (MathJax, Mermaid, Raphael, Underscore)
- System font stacks instead of Google Fonts
- Enhanced session restoration
- Improved drag & drop handling
- Better error handling and debugging

## Installation

Download the latest installer from the [Releases](https://github.com/nambatipudi/PrintDown/releases) page:

- **Windows**: `PrintDown-Setup-x.x.x.exe` - Run the installer and follow the wizard
- **macOS**: `PrintDown-x.x.x.dmg` - Open DMG and drag to Applications folder ([detailed guide](MACOS_INSTALLATION.md))
- **Linux**: `PrintDown-x.x.x.AppImage` - Make executable and run

### Quick Start
1. Download the appropriate installer for your platform
2. Install (drag to Applications on macOS, run installer on Windows)
3. Launch PrintDown
4. Drag and drop your `.md` files or use File → Open


## Usage

### Opening Files

PrintDown offers multiple convenient ways to open Markdown files:

1. **Drag and Drop** 
   - Simply drag `.md` or `.markdown` files from your file explorer
   - Drop them anywhere on the PrintDown window
   - Multiple files can be dropped at once (opens in separate tabs)
   - Visual feedback shows when files are ready to drop

2. **File Menu** (Ctrl/Cmd + O)
   - Click **File → Open**
   - Browse and select your Markdown file
   - Supports `.md` and `.markdown` extensions

3. **Double-Click** (optional)
   - If you enabled file association during installation
   - Double-click any `.md` file in your file explorer
   - Opens directly in PrintDown

4. **Command Line**
   - Launch with a file: `printdown myfile.md`
   - Opens the specified file on startup

### Adjusting Font Size
- Click **-** button to decrease
- Click **⟲** button to reset to default
- Click **+** button to increase

### Resizing Images (per‑image)
- Hover any image to reveal a resize handle at the bottom‑right
- Drag the handle to resize (aspect ratio preserved)
- Double‑click the image to reset to 100%
- Your choice is remembered per file and used during PDF export

### Using Table of Contents (NEW!)
- Click the **☰ hamburger button** (top-left) to open/close TOC sidebar
- Or use **View → Toggle Table of Contents** from the menu
- Or press **Ctrl/Cmd + \\** keyboard shortcut
- Click any heading in the TOC to navigate smoothly to that section
- Current section is highlighted automatically as you scroll

### Changing Themes
Use **View → Theme** from the menu to choose from 16+ beautiful themes.

### Exporting to PDF
- **File → Export to PDF** (Ctrl/Cmd + E)
- Choose save location
- PDF will be generated with current theme and font size

### Printing
- **File → Print** (Ctrl/Cmd + P)
- Use system print dialog
- Can save as PDF via print dialog

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open File | `Ctrl/Cmd + O` |
| Print | `Ctrl/Cmd + P` |
| Export to PDF | `Ctrl/Cmd + E` |
| **Toggle TOC Sidebar** | `Ctrl/Cmd + \` |
| **Increase Font Size** | Available in View menu |
| **Decrease Font Size** | Available in View menu |
| **Reset Font Size** | Available in View menu |
| Exit | `Ctrl/Cmd + Q` |

## Why PrintDown (vs. VS Code Preview)

- **Professional Navigation**: Built-in Table of Contents sidebar with smooth scrolling and active section highlighting
- **Better Math Rendering**: Enhanced MathJax pipeline with improved parenthetical expression support and consistent spacing
- **Per‑Image Resizing**: Resize individual images visually and keep aspect ratio. Settings persist and apply to PDF output
- **Diagrams**: Built‑in Mermaid and UML sequence support with theme awareness; no extensions required
- **Print & Export**: First‑class PDF export (and print) that respects theme, font size, and image sizes with page‑friendly styles
- **Tabs & Management**: Multi‑tab viewer with right‑click context menu (Close, Close Others, Close All)
- **Completely Offline**: Zero CDN dependencies - works without internet connection
- **Modern Architecture**: Electron 39 with latest security features and performance improvements
- **Performance & Focus**: A dedicated viewer focused on reading/printing Markdown with less editor overhead

## SVG Support

PrintDown fully supports SVG (Scalable Vector Graphics) in two ways:

### 1. External SVG Files
Reference SVG files using standard Markdown image syntax:
```markdown
![My Icon](./images/icon.svg)
```

### 2. Inline SVG (Raw HTML)
Embed SVG code directly in your Markdown:
```markdown
<svg width="100" height="100">
  <circle cx="50" cy="50" r="40" fill="#4CAF50" />
</svg>
```

See `Test_Files/SVG_Support_Test.md` for comprehensive examples including:
- External SVG file loading
- Inline SVG with gradients
- Animated SVG
- Data URI SVG

## Markdown Examples

### Math Example
```markdown
Inline math: $E = mc^2$

Display math:
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

### Mermaid Diagram Example
````markdown
```mermaid
graph TD
    A[Start] --> B{Is it?}
    B -->|Yes| C[OK]
    B -->|No| D[End]
```
````

### UML Sequence Diagram Example
````markdown
```uml-sequence-diagram
Alice->Bob: Hello Bob, how are you?
Note right of Bob: Bob thinks
Bob-->Alice: I am good thanks!
```
````

## License

This project is open source and available under the [MIT License](LICENSE).

## Author

**Nambatipudi**
- GitHub: [@nambatipudi](https://github.com/nambatipudi)

## Acknowledgments

- MathJax for mathematical typesetting
- Mermaid for diagram rendering
- Marked.js for Markdown parsing
- Electron community for the amazing framework

---
