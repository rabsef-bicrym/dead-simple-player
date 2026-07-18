/**
 * Parser for the library's NFO essay descriptions.
 *
 * The server flattens paragraph breaks out of XMLTV descriptions, but
 * MST3K-style section markers ("THE MOVIE:", "THE SHORT:",
 * "THIS RECORDING:") survive as literal text. This module splits an
 * essay into sections and paragraphs for typeset rendering, honoring
 * real paragraph breaks (\n\n) if the server ever preserves them.
 */

const SECTION_MARKERS = ['THE MOVIE:', 'THE SHORT:', 'THIS RECORDING:'] as const;

export interface EssaySection {
  header?: string;
  paragraphs: string[];
}

/** Split flattened essay text into sections and paragraphs. */
export function parseEssay(text: string): EssaySection[] {
  const markerPattern = new RegExp(
    `(${SECTION_MARKERS.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'g',
  );
  const chunks = text.split(markerPattern).filter((c) => c.trim().length > 0);

  const sections: EssaySection[] = [];
  let pendingHeader: string | undefined;

  for (const chunk of chunks) {
    if ((SECTION_MARKERS as readonly string[]).includes(chunk)) {
      pendingHeader = chunk.replace(/:$/, '');
      continue;
    }
    const paragraphs = chunk
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 0);
    if (paragraphs.length === 0) continue;
    sections.push({ header: pendingHeader, paragraphs });
    pendingHeader = undefined;
  }

  return sections;
}
