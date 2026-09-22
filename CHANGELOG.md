# Changelog

All notable user-facing changes are documented in this file.

## 1.7.5 - 2026-09-22

### Added

- A document-first editorial interface with a centered reading measure, clearer toolbar labels, improved keyboard focus states, and a richer empty state.
- Six contrast-conscious themes: Modern Slate, Modern Sage, Modern Rose, Retro Amber, Retro Sunset, and Retro Pixel.
- A3 Page View and PDF export support.
- Unsaved-change protection for Close, Close Others, and Close All.
- End-to-end coverage for Markdown sanitization, including removal of script tags, inline event handlers, and `javascript:` URLs.

### Changed

- Page View, page guides, page breaks, and PDF export now use one shared page-dimension model.
- The packaged Mermaid and MathJax bundles are copied from their pinned npm packages, preventing shipped-code drift from audited dependency versions.
- Mermaid, MarkdownIt, and DOMPurify were updated to patched versions.

### Fixed

- Closing other tabs now disposes file watchers and revokes unused protocol-directory access.
- Switching documents resets the reader scroll position.
- Production dependency audit reports no known vulnerabilities.

## 1.7.4

- Previous release.
