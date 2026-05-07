// Parenthetical patterns to strip before general punctuation removal
const STRIP_PARENS = /\s*\((?:USA|Europe|Japan|World|Rev\s*\w+|v[\d.]+|En|Fr|De|Es|It|Nl|Pt|Sv|No|Da|Fi|Pl|Ru|Zh|Ko|[A-Z]{2,3}(?:,\s*[A-Z]{2,3})*|[^)]*)\)/gi

export function normalizeTitle(raw: string): string {
  return raw
    .replace(/\.[a-z0-9]{1,5}$/i, '')     // strip extension
    .replace(STRIP_PARENS, '')             // strip region/rev/version parens
    .replace(/[^a-z0-9 ]/gi, ' ')         // replace remaining punctuation with space
    .toLowerCase()
    .replace(/\s+/g, ' ')                  // collapse whitespace
    .trim()
}
