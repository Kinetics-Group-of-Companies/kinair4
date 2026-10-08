// Cover/index parsing is structural: serials, page numbers and checklist
// status columns are metadata, never divider names or project values.
export function parseIndexHeadings(text: string): string[] {
  const result: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/\u00a0/g, ' ').trim().replace(/^\|\s*|\s*\|$/g, '');
    if (!line || /^\[.*(?:READ|CHECK|OCR).*\]$/i.test(line) || /^[-|:\s]+$/.test(line)) continue;
    if (/^(?:technical\s+submission\s+checklist|project\s+name|sr\.?\s*no\.?|s\.?\s*no\.?|item|description|comments|yes|no|n\/?a|index|contents|table of contents|page(?:\s+no\.?)?)(?:\s*[:|\t]|$)/i.test(line)) continue;
    const numbered = /^\d+(?:\.\d+)*[.)\-:]?(?:\s+|\|)/.test(line);
    line = line.replace(/^\d+(?:\.\d+)*[.)\-:]?(?:\s+|\|)+/, '').replace(/^[•*]\s*/, '');
    line = line.replace(/\s*(?:\||\t).*$/, '').replace(/\s+(?:Yes|No|N\/?A)(?:\s.*)?$/i, '')
      .replace(/\s*\.{2,}\s*\d+\s*$/, '').replace(/\s+\d{1,3}\s*$/, '').trim();
    if (!line || /^\d+$/.test(line) || /^(?:yes|no|n\/?a)$/i.test(line)) continue;
    if (!numbered && result.length && (/&$/.test(result.at(-1)!) || (result.at(-1)!.match(/\(/g)?.length ?? 0) > (result.at(-1)!.match(/\)/g)?.length ?? 0))) {
      result[result.length - 1] += ' ' + line;
      continue;
    }
    result.push(line);
  }
  return result.filter((line, i) => result.findIndex(other => other.toLowerCase().replace(/\s+/g, " ") === line.toLowerCase().replace(/\s+/g, " ")) === i);
}

export function parseCoverDetails(text: string): { label: string; value: string }[] {
  const fields: { label: string; value: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\u00a0/g, ' ').trim();
    if (!line || /^\[.*\]$/.test(line) || /^(?:project details|cover details)\s*:?$/i.test(line)) continue;
    const match = line.match(/^([^:\t]{2,60})\s*[:\t]+\s*(.*)$/);
    if (match) {
      const label = match[1].trim(), value = match[2].trim();
      if (!value) continue;
      const previous = fields.find(f => f.label.toLowerCase() === label.toLowerCase());
      if (!previous) fields.push({label, value});
    } else if (fields.length && !/^\[|^page\s+\d/i.test(line)) fields[fields.length - 1].value += ' ' + line;
  }
  return fields;
}

export function setupPdfLines(items: {str?: string; transform?: number[]; width?: number}[]): string {
  const rows: {y: number; items: typeof items}[] = [];
  for (const item of items.filter(i => i.str?.trim() && i.transform).sort((a,b) => b.transform![5] - a.transform![5])) {
    const y = item.transform![5];
    let row = rows.find(r => Math.abs(r.y - y) <= 6);
    if (!row) { row = {y, items: []}; rows.push(row); }
    row.items.push(item);
  }
  return rows.map(row => {
    const sorted = row.items.sort((a,b) => a.transform![4] - b.transform![4]);
    return sorted.map((item,i) => {
      if (!i) return item.str;
      const prev = sorted[i-1];
      const gap = item.transform![4] - (prev.transform![4] + (prev.width ?? 0));
      return (gap > 18 ? '\t' : gap > 1.5 ? ' ' : '') + item.str;
    }).join('').trim();
  }).join('\n');
}
