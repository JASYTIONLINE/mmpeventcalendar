/**
 * Reads private/ksw-roadmap-db.csv and writes assets/data/ksw-syllabus.json
 * Run from repo root: node scripts/csv-to-syllabus-json.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const csvPath = path.join(root, 'private', 'ksw-roadmap-db.csv');
const outPath = path.join(root, 'assets', 'data', 'ksw-syllabus.json');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (c === '\r') continue;
    if (c === '\n') {
      row.push(field);
      if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
  return rows;
}

const text = fs.readFileSync(csvPath, 'utf8');
const rows = parseCsv(text);
if (rows.length < 2) throw new Error('CSV empty or invalid');

const beltStepLabels = {};
const items = [];
const objects = {};
let currentHeader = null;

function normalizeHeaderName(name, idx) {
  const base = String(name || '').trim();
  return base || 'col' + (idx + 1);
}

function mapRowByHeader(header, cells) {
  const out = {};
  const width = Math.max(header ? header.length : 0, cells.length);
  for (let i = 0; i < width; i++) {
    const key = normalizeHeaderName(header && header[i], i);
    out[key] = String(cells[i] || '').trim();
  }
  return out;
}

function toInt(value) {
  const n = parseInt(String(value || '').trim(), 10);
  return Number.isNaN(n) ? null : n;
}

for (const cells of rows) {
  const object = String(cells[0] || '').trim();
  if (!object) continue;

  if (object.toLowerCase() === 'object') {
    currentHeader = cells.map(function (cell, idx) {
      return normalizeHeaderName(cell, idx);
    });
    continue;
  }

  const mapped = mapRowByHeader(currentHeader, cells);
  if (!objects[object]) objects[object] = [];
  objects[object].push(mapped);

  if (object === 'Syllibus') {
    const count = parseInt(String(cells[1] || '').trim(), 10);
    const key = String(cells[2] || '').trim();
    const rank = parseInt(String(cells[3] || '').trim(), 10);
    if (Number.isNaN(rank) || rank < 1 || !key) continue;

    items.push({
      count: Number.isNaN(count) ? null : count,
      key,
      rank,
      learningObjective: String(cells[4] || '').trim(),
      name: String(cells[5] || '').trim(),
      type: String(cells[6] || '').trim(),
      status: String(cells[7] || '').trim(),
      description: String(cells[8] || '').trim()
    });
    continue;
  }

  if (object === 'Glossary') {
    const rank = parseInt(String(cells[3] || '').trim(), 10);
    const beltName = String(cells[5] || '').trim();
    if (!Number.isNaN(rank) && rank >= 1 && rank <= 16 && beltName) {
      beltStepLabels[String(rank)] = beltName;
    }
    continue;
  }
}

if (!beltStepLabels['16']) beltStepLabels['16'] = 'Jyo Kyo Nim';

const categoryPriority = {};
const priorityRows = objects.Priority || [];
priorityRows.forEach(function (row) {
  const typeName = String((row && row.Type) || '').trim();
  const priority = toInt(row && row.Rank);
  if (!typeName || priority == null) return;
  categoryPriority[typeName] = priority;
});

const payload = {
  version: 1,
  source: 'private/ksw-roadmap-db.csv',
  beltStepLabels,
  items,
  categoryPriority,
  objects
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 0), 'utf8');
console.log('Wrote', items.length, 'syllabus items to', path.relative(root, outPath));
