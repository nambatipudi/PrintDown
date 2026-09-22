# Changelog

All notable user-facing changes are documented in this file.

## 1.7.6 - 2026-09-22

### Security

- Removed the unrestricted renderer IPC bridge and replaced it with narrowly scoped APIs.
- Prevented external navigation from retaining privileged application APIs; HTTP(S) links now open in the system browser.
- Restricted file, file-watch, and protocol access to main-process-issued file grants.
- Made `printdown://` fail closed when no authorized document directory exists.
- Sanitized Markdown before intermediate image-path rewriting to prevent event handlers from firing during DOM preprocessing.
- Rendered tab titles with `textContent`, preventing filenames from being interpreted as HTML.

### Fixed

- Restored secure drag-and-drop file access through a trusted preload handoff.
- Removed repeated context-menu dismissal listener registration.
- Rejected malformed command-line file arguments safely.
- Removed obsolete renderer helpers and dead PDF IPC handshake code.
- Corrected the application stylesheet's unmatched closing brace.

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
