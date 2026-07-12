import type { RecognitionResult } from 'ppu-paddle-ocr/web';

export type ParsedSheetRow = {
  dateISO: string; // yyyy-mm-dd
  mealsKg: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
  confidence: number; // 0..1
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function normalizeDateToISO(text: string): string | null {
  const raw = text
    .trim()
    .replace(/\s+/g, '')
    // common OCR confusions in dates
    .replace(/[Oo]/g, '0')
    .replace(/[Il]/g, '1');

  // Find a date substring anywhere (OCR often adds trailing punctuation).
  const m1 = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    let yyyy = Number(m1[3]);
    if (yyyy < 100) yyyy = 2000 + yyyy;
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
    return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
  }
  // OCR sometimes drops separators: ddmmyy or ddmmyyyy
  const m2 = raw.match(/(\d{2})(\d{2})(\d{2}|\d{4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    let yyyy = Number(m2[3]);
    if (yyyy < 100) yyyy = 2000 + yyyy;
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
    return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
  }
  return null;
}

function parseKg(text: string): string | null {
  const cleaned = text
    .replace(/[^\d.]/g, '')
    .replace(/\.{2,}/g, '.')
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

type RowCluster = { items: RecognitionResult[]; yCenter: number };

function median(values: number[]): number {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function parseSheetRows(results: RecognitionResult[]): ParsedSheetRow[] {
  const items = results
    .map((r) => ({ ...r, text: r.text.trim() }))
    .filter((r) => r.text.length > 0);

  const heights = items.map((r) => r.box.height);
  const rowThreshold = Math.max(10, median(heights) * 0.75);

  const sorted = [...items].sort((a, b) => {
    const ay = a.box.y + a.box.height / 2;
    const by = b.box.y + b.box.height / 2;
    if (ay !== by) return ay - by;
    return a.box.x - b.box.x;
  });

  const clusters: RowCluster[] = [];
  for (const it of sorted) {
    const y = it.box.y + it.box.height / 2;
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(last.yCenter - y) <= rowThreshold) {
      last.items.push(it);
      last.yCenter = (last.yCenter * (last.items.length - 1) + y) / last.items.length;
    } else {
      clusters.push({ items: [it], yCenter: y });
    }
  }

  const width = Math.max(1, ...items.map((r) => r.box.x + r.box.width));

  // Try to locate the printed meal column headers "1 2 3 4 5" near the top.
  // If found, use them as column centers for robust mapping.
  const headerCandidates = items
    .map((it) => ({
      it,
      key: it.text.replace(/[^\d]/g, ''),
      y: it.box.y + it.box.height / 2,
      x: it.box.x + it.box.width / 2,
    }))
    .filter((x) => ['1', '2', '3', '4', '5'].includes(x.key));

  const mealCenters = new Map<1 | 2 | 3 | 4 | 5, number>();
  for (const k of [1, 2, 3, 4, 5] as const) {
    const cands = headerCandidates
      .filter((c) => c.key === String(k))
      .sort((a, b) => a.y - b.y);
    if (cands[0]) mealCenters.set(k, cands[0].x);
  }

  const hasMealCenters = mealCenters.size >= 3;
  const fallbackMealStart = width * 0.28;
  const fallbackMealEnd = width * 0.62;

  const rows: ParsedSheetRow[] = [];
  for (const c of clusters) {
    const dateMatches = c.items
      .map((it) => ({ it, iso: normalizeDateToISO(it.text) }))
      .filter((x) => x.iso);
    // Date is in the left-most column; pick the left-most parsed date.
    const dateItem = dateMatches.sort((a, b) => a.it.box.x - b.it.box.x)[0];
    if (!dateItem?.iso) continue;

    const meals: Partial<Record<1 | 2 | 3 | 4 | 5, string>> = {};
    let confSum = 0;
    let confCount = 0;

    const numericItems = c.items
      .map((it) => ({
        it,
        x: it.box.x + it.box.width / 2,
        kg: parseKg(it.text),
      }))
      .filter((x) => !!x.kg);

    if (hasMealCenters) {
      const tolerance = width * 0.06;
      for (const k of [1, 2, 3, 4, 5] as const) {
        const cx = mealCenters.get(k);
        if (cx == null) continue;
        const best = numericItems
          .map((n) => ({ ...n, dx: Math.abs(n.x - cx) }))
          .filter((n) => n.dx <= tolerance)
          .sort((a, b) => a.dx - b.dx || b.it.confidence - a.it.confidence)[0];
        if (best?.kg) {
          meals[k] = best.kg;
          confSum += best.it.confidence;
          confCount += 1;
        }
      }
    } else {
      for (const it of c.items) {
        const xCenter = it.box.x + it.box.width / 2;
        if (xCenter < fallbackMealStart || xCenter > fallbackMealEnd) continue;
        const kg = parseKg(it.text);
        if (!kg) continue;

        const rel = (xCenter - fallbackMealStart) / Math.max(1, fallbackMealEnd - fallbackMealStart);
        const idx = Math.min(5, Math.max(1, Math.floor(rel * 5) + 1)) as 1 | 2 | 3 | 4 | 5;

        // Keep the more confident value if collision.
        if (!meals[idx] || it.confidence > 0.8) {
          meals[idx] = kg;
        }
        confSum += it.confidence;
        confCount += 1;
      }
    }

    rows.push({
      dateISO: dateItem.iso,
      mealsKg: meals,
      confidence: confCount ? confSum / confCount : 0,
    });
  }

  // De-dup by date: keep highest confidence
  const bestByDate = new Map<string, ParsedSheetRow>();
  for (const r of rows) {
    const prev = bestByDate.get(r.dateISO);
    if (!prev || r.confidence > prev.confidence) bestByDate.set(r.dateISO, r);
  }
  return Array.from(bestByDate.values()).sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
}

