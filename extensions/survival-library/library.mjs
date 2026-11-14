import { readFile, realpath, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

export function findRoot(cwd) {
  let dir = resolve(cwd);
  while (true) {
    if (existsSync(join(dir, 'data/pi-library')) && existsSync(join(dir, 'data/documents/manifest.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

async function inside(root, relative) {
  const base = await realpath(root);
  const path = await realpath(join(base, relative));
  if (!path.startsWith(base + sep)) throw new Error('Path outside library');
  return path;
}

export async function catalog(root) {
  const path = await inside(root, 'data/documents/manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  return manifest.sources.flatMap(source => source.extracted_files.map(relative => {
    const file = basename(relative);
    const page = file.match(/-page-(\d+)\.txt$/)?.[1];
    return { file, source: source.id, title: source.title,
      link: 'http://127.0.0.1:8081/originals/' + encodeURIComponent(basename(source.original)) + (page ? '#page=' + Number(page) : '') };
  }));
}

async function document(root, file, signal) {
  signal?.throwIfAborted();
  const path = await inside(join(root, 'data/pi-library'), file);
  if ((await stat(path)).size > 250000) throw new Error('Extract exceeds 250 KB limit');
  return readFile(path, { encoding: 'utf8', signal });
}

const stop = new Set('a an the can could does do is are my your it its for of to in on with from and or use resources survival cite them support plus what how me please manual source'.split(' '));
const tokens = text => [...new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter(t => !stop.has(t));

export async function search(root, query, source = '', signal) {
  const entries = await catalog(root);
  const sources = [...new Set(entries.map(e => e.source))];
  let terms = tokens(query.replace(/well\s+pump/gi, 'pump')).slice(0, 24);
  if (!terms.length) return { text: 'Available sources: ' + sources.join(', ') + '\nSearch with topic keywords, for example: AC output voltage.', hits: [] };
  if (!source) {
    const brands = [['anker', /\banker\b|\bf3800\b/i], ['renogy', /\brenogy\b/i], ['wen', /\bwen\b|\bdf680ix\b/i], ['cdc', /\bcdc\b/i], ['epa', /\bepa\b/i]].filter(([, pattern]) => pattern.test(query));
    if (brands.length === 1) source = brands[0][0];
  }
  const selected = entries.filter(e => e.source.includes(source.toLowerCase()));
  if (!selected.length) return { text: 'Unknown source. Available sources: ' + sources.join(', '), hits: [] };
  const topicTerms = terms.filter(t => !selected.every(e => tokens(e.title + ' ' + e.source).includes(t)));
  if (topicTerms.length) terms = topicTerms;
  const docs = [];
  for (const entry of selected) {
    const raw = await document(root, entry.file, signal);
    // Exclude shared provenance headers from content ranking.
    const lines = raw.split('\n').slice(7);
    const body = lines.filter(l => !/^(Source|Title|Publisher|Local |Original |Retrieved|PDF |Document|Publication|SHA|Checksum|Locator|Snapshot)/i.test(l) && !l.includes(entry.title)).join('\n');
    docs.push({ ...entry, body, words: body.toLowerCase().match(/[a-z0-9]+/g) ?? [] });
  }
  const frequencies = terms.map(term => docs.filter(d => d.words.includes(term)).length);
  const avgLength = docs.reduce((sum, d) => sum + d.words.length, 0) / (docs.length || 1);
  const ranked = docs.map(d => {
    let score = 0;
    terms.forEach((term, i) => {
      const tf = d.words.filter(word => word === term).length;
      score += Math.log(1 + (docs.length - frequencies[i] + 0.5) / (frequencies[i] + 0.5)) * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * d.words.length / (avgLength || 1)));
      if (tokens(d.source + ' ' + d.title).includes(term)) score += 0.15;
    });
    for (let i = 0; i < terms.length - 1; i++) {
      if (d.body.toLowerCase().includes(terms[i] + ' ' + terms[i + 1])) score += 0.8;
    }
    return { ...d, score };
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  if (!ranked.length && terms.includes('pump') && /anker|f3800/.test(source + ' ' + query.toLowerCase())) {
    const fallback = await search(root, 'AC output power specifications overload', source || 'anker', signal);
    return { ...fallback, text: 'No direct pump keyword matches. Related electrical ratings follow; these do NOT establish pump compatibility or motor-starting capability.\n\n' + fallback.text };
  }
  const hits = ranked.slice(0, 4).map(d => {
    const lines = d.body.split('\n');
    let best = 0, bestScore = -1;
    for (let i = 0; i < lines.length; i++) {
      const score = terms.filter(t => tokens(lines.slice(i, i + 4).join(' ')).includes(t)).length;
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return { file: d.file, title: d.title, link: d.link, excerpt: lines.slice(Math.max(0, best - 1), best + 6).join('\n').slice(0, 950) };
  });
  const text = hits.length
    ? hits.map(h => `${h.file}\n${h.title}\n${h.link}\n${h.excerpt}`).join('\n\n') + `\n\nShowing ${hits.length} of ${ranked.length} keyword matches. These are excerpts, not compatibility verdicts. Use survival_read for the full passage. Refine topic keywords if results are weak.`
    : 'No keyword matches. This does not prove absence from the originals. Try broader terms (for a pump: AC output voltage, starting, overload). Sources: ' + sources.join(', ');
  return { text, hits };
}

export async function readPage(root, file, offset = 1, signal) {
  if (file !== basename(file) || !/^[a-z0-9-]+\.txt$/.test(file)) throw new Error('Use an exact extract filename from survival_search, not a path');
  if (!Number.isInteger(offset) || offset < 1) throw new Error('offset must be a positive line number');
  const entry = (await catalog(root)).find(e => e.file === file);
  if (!entry) throw new Error('File not in source manifest');
  const raw = await document(root, file, signal);
  const lines = raw.split('\n');
  const output = [];
  let used = 0, next = offset - 1;
  while (next < lines.length && output.length < 80) {
    const line = `${next + 1}: ${lines[next]}`;
    if (used + Buffer.byteLength(line) > 7000) {
      if (!output.length) throw new Error('Line exceeds output limit; inspect the linked original');
      break;
    }
    output.push(line); used += Buffer.byteLength(line) + 1; next++;
  }
  return `${entry.title}\n${entry.link}\n${output.join('\n')}\n` + (next < lines.length ? `More lines: survival_read file="${file}" offset=${next + 1}` : 'End of extract. Check the original PDF for table layout and diagrams.');
}
