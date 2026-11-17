import * as zlib from 'zlib';

export interface EpubChapter {
  title: string;
  xhtml: string;
}

export interface EpubImage {
  fileName: string;
  mediaType: string;
  base64: string;
}

export interface EpubPayload {
  title?: string;
  author?: string;
  language?: string;
  identifier?: string;
  css?: string;
  chapters?: EpubChapter[];
  images?: EpubImage[];
}

interface ZipEntry {
  name: string;
  data: Buffer;
  store: boolean;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (let index = 0; index < buffer.length; index++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[index]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2)),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

/**
 * Minimal ZIP writer. EPUB requires the `mimetype` entry to be the first entry
 * and stored uncompressed, which is why per-entry compression is controllable.
 */
function createZip(entries: ZipEntry[]): Buffer {
  const stamp = dosDateTime(new Date());
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const payload = entry.store ? entry.data : zlib.deflateRawSync(entry.data, { level: 9 });
    const checksum = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034B50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(entry.store ? 0 : 8, 8);
    localHeader.writeUInt16LE(stamp.time, 10);
    localHeader.writeUInt16LE(stamp.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014B50, 0);
    centralHeader.writeUInt16LE(0x031E, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(entry.store ? 0 : 8, 10);
    centralHeader.writeUInt16LE(stamp.time, 12);
    centralHeader.writeUInt16LE(stamp.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    // Unix 0644 in the high word so extracted files stay readable.
    centralHeader.writeUInt32LE(0o100644 * 0x10000, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054B50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeFileName(name: string, fallback: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[-.]+/, '');
  return cleaned.length > 0 ? cleaned : fallback;
}

const IMAGE_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp'
]);

const DEFAULT_CSS = `body { margin: 1em; line-height: 1.6; }
img, svg { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; word-wrap: break-word; }
table { border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 0.3em 0.6em; }
`;

function chapterDocument(chapter: EpubChapter, language: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
<meta charset="utf-8" />
<title>${escapeXml(chapter.title)}</title>
<link rel="stylesheet" type="text/css" href="../styles.css" />
</head>
<body>
${chapter.xhtml}
</body>
</html>`;
}

/**
 * Builds a valid EPUB 3 archive (with an EPUB 2 NCX fallback) from rendered content.
 */
export function buildEpub(payload: EpubPayload): Buffer {
  const title = (payload.title || 'Untitled Document').trim() || 'Untitled Document';
  const author = (payload.author || 'PrintDown').trim() || 'PrintDown';
  const language = (payload.language || 'en').trim() || 'en';
  const identifier = payload.identifier || `urn:uuid:${randomUuid()}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const rawChapters = Array.isArray(payload.chapters) ? payload.chapters : [];
  const chapters: EpubChapter[] = rawChapters
    .filter(chapter => chapter && typeof chapter.xhtml === 'string')
    .map((chapter, index) => ({
      title: (chapter.title || `Section ${index + 1}`).trim() || `Section ${index + 1}`,
      xhtml: chapter.xhtml
    }));

  if (chapters.length === 0) {
    chapters.push({ title, xhtml: '<p />' });
  }

  const images = (Array.isArray(payload.images) ? payload.images : [])
    .filter(image => image
      && typeof image.base64 === 'string'
      && IMAGE_MEDIA_TYPES.has(image.mediaType))
    .map((image, index) => ({
      mediaType: image.mediaType,
      base64: image.base64,
      fileName: sanitizeFileName(image.fileName, `image-${index + 1}`)
    }));

  const entries: ZipEntry[] = [
    { name: 'mimetype', data: Buffer.from('application/epub+zip', 'ascii'), store: true },
    {
      name: 'META-INF/container.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`, 'utf8'),
      store: false
    },
    {
      name: 'OEBPS/styles.css',
      data: Buffer.from(`${DEFAULT_CSS}\n${payload.css || ''}`, 'utf8'),
      store: false
    }
  ];

  const chapterFiles = chapters.map((chapter, index) => `text/chapter-${index + 1}.xhtml`);

  chapters.forEach((chapter, index) => {
    entries.push({
      name: `OEBPS/${chapterFiles[index]}`,
      data: Buffer.from(chapterDocument(chapter, language), 'utf8'),
      store: false
    });
  });

  images.forEach(image => {
    entries.push({
      name: `OEBPS/images/${image.fileName}`,
      data: Buffer.from(image.base64, 'base64'),
      store: false
    });
  });

  const navItems = chapters
    .map((chapter, index) => `      <li><a href="${chapterFiles[index]}">${escapeXml(chapter.title)}</a></li>`)
    .join('\n');

  entries.push({
    name: 'OEBPS/nav.xhtml',
    data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
<meta charset="utf-8" />
<title>${escapeXml(title)}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${escapeXml(title)}</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`, 'utf8'),
    store: false
  });

  const ncxPoints = chapters
    .map((chapter, index) => `    <navPoint id="navpoint-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(chapter.title)}</text></navLabel>
      <content src="${chapterFiles[index]}"/>
    </navPoint>`)
    .join('\n');

  entries.push({
    name: 'OEBPS/toc.ncx',
    data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(identifier)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${ncxPoints}
  </navMap>
</ncx>`, 'utf8'),
    store: false
  });

  const manifestItems = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '    <item id="css" href="styles.css" media-type="text/css"/>',
    ...chapterFiles.map((file, index) =>
      `    <item id="chapter-${index + 1}" href="${file}" media-type="application/xhtml+xml"/>`),
    ...images.map((image, index) =>
      `    <item id="image-${index + 1}" href="images/${image.fileName}" media-type="${image.mediaType}"/>`)
  ].join('\n');

  const spineItems = chapterFiles
    .map((_file, index) => `    <itemref idref="chapter-${index + 1}"/>`)
    .join('\n');

  entries.push({
    name: 'OEBPS/content.opf',
    data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>${escapeXml(language)}</dc:language>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <meta property="dcterms:modified">${escapeXml(modified)}</meta>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`, 'utf8'),
    store: false
  });

  return createZip(entries);
}

function randomUuid(): string {
  const bytes = require('crypto').randomBytes(16) as Buffer;
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
