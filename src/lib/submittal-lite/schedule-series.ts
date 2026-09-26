export type SeriesModel = { code: string; series: string };
export type ScheduleSeriesResult = { series: string[]; unresolved: string[] };


const compactModel = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let left = i;
    let diagonal = i - 1;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j];
      const next = Math.min(above + 1, left + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
      prev[j] = next;
      left = next;
    }
  }
  return prev[b.length];
}

/** Correct a narrow OCR typo only when the selector/admin catalogue gives one unique model. */
export function normalizeOcrModelCodes(text: string, modelCatalog: SeriesModel[]): string {
  if (!text || !modelCatalog.length) return text;
  const candidates = [...new Map(modelCatalog.map((item) => [compactModel(item.code), item.code])).entries()]
    .filter(([compact]) => compact.length >= 5);
  return text.replace(/\b[A-Z]{1,4}[\s._-]*\d{2,4}(?:[\s._-]*(?:MR|XD|N|L|M|P|Y))?(?:\([^)]{1,6}\))?/gi, (raw) => {
    const token = compactModel(raw);
    const exact = candidates.find(([compact]) => compact === token);
    if (exact) return exact[1];
    const digits = token.match(/\d{2,4}/)?.[0];
    if (!digits) return raw;
    const close = candidates.filter(([compact]) => compact.includes(digits) && editDistance(token, compact) <= 1);
    return close.length === 1 ? close[0][1] : raw;
  });
}

const builtInSeries = ["KVF-MR", "KVF-M", "KVF-P", "KIN-E", "KTAF", "N-Cross Flow", "N-Centrifugal Flow", "XD-Centrifugal Flow", "WING", "VVS"];

export function seriesProductType(name: string): "Fan" | "Air Curtains" | undefined {
  const compact = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^(KVFMR|KVFM|KVFP|KINE|KTAF)/.test(compact)) return "Fan";
  if (/^(NCROSSFLOW|NCENTRIFUGALFLOW|XDCENTRIFUGALFLOW|WING)/.test(compact)) return "Air Curtains";
  return undefined;
}

/** Only these series have a live KINAIR selection engine capable of generating TDS. */
export function isSelectorSeries(name: string): boolean {
  const compact = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^(KVFMR|KVFM|KVFP|KINE|KTAF|NCROSSFLOW|NCENTRIFUGALFLOW|XDCENTRIFUGALFLOW)$/.test(compact);
}

/** Detect explicit series codes; never reinterpret an approximate code as another product. */
export function detectScheduleSeries(text: string, availableSeries: string[] = [], modelCatalog: SeriesModel[] = []): ScheduleSeriesResult {
  const input = text.toUpperCase().replace(/[‐‑–—]/g, "-");
  const detected = new Set<string>();
  for (const name of [...builtInSeries, ...availableSeries]) {
    const series = name.trim().toUpperCase();
    if (!series || /^(?:FAN|AHU|FAHU|MATERIAL|SCHEDULE|GENERAL)$/i.test(series)) continue;
    const escaped = series.split(/[\s._-]+/).filter(Boolean).join("[\\s._-]*");
    if (escaped.length < 3) continue;
    const pattern = new RegExp("(^|[^A-Z0-9])" + escaped + "(?=$|[^A-Z]|[0-9])", "i");
    const compact = series.replace(/[^A-Z0-9]/g, "");
    const spacedCode = /^(?:KVFMR|KVFM|KVFP|KINE|KTAF)$/.test(compact)
      ? new RegExp("(^|[^A-Z0-9])" + compact.split("").join("[\\s._-]*") + "(?=$|[^A-Z]|[0-9])", "i")
      : null;
    if (pattern.test(input) || spacedCode?.test(input)) detected.add(name);
  }
  // The selectors store actual model sizes/codes; match those codes to their series.
  // Match the distinctive stem of air-curtain variants without guessing from FM-3510 alone.
  const canonical = (name: string) => [...builtInSeries, ...availableSeries].find((value) =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, "") === name.toUpperCase().replace(/[^A-Z0-9]/g, "")) ?? name;
  for (const model of modelCatalog) {
    const code = model.code.toUpperCase().replace(/[‐‑–—]/g, "-");
    const fan = /^KVF-(\d{2,4})(MR|M|P)$/.exec(code);
    const airCross = /^FM-(\d{4})N/.exec(code);
    const airXd = /^FM-(\d{4})XD/.exec(code);
    const airCentrifugal = /^FM-(\d{4})-L/.exec(code);
    const stem = fan ? `KVF[\\s._-]*${fan[1]}[\\s._-]*${fan[2]}`
      : airCross ? `FM[\\s._-]*${airCross[1]}[\\s._-]*N`
      : airXd ? `FM[\\s._-]*${airXd[1]}[\\s._-]*XD`
      : airCentrifugal ? `FM[\\s._-]*${airCentrifugal[1]}[\\s._-]*L`
      : code.split(/[^A-Z0-9]+/).filter(Boolean).join("[\\s._-]*");
    if (!stem || stem.length < 6) continue;
    if (new RegExp("(^|[^A-Z0-9])" + stem + "(?=$|[^A-Z0-9])", "i").test(input)) detected.add(canonical(model.series));
  }
  // KVF-MR model convention is supplied by the product team; the selector table
  // does not yet contain its sizes. The explicit MR suffix prevents M confusion.
  if (/(^|[^A-Z0-9])KVF[\\s._-]*\d{2,4}[\\s._-]*MR(?=$|[^A-Z0-9])/.test(input)) {
    detected.add(canonical("KVF-MR"));
  }
  const unresolved = new Set<string>();
  const uncertain = /(^|[^A-Z0-9])(KBFP|KBFMR|KBFM|KTF)(?=$|[^A-Z]|[0-9])/g;
  for (const hit of input.matchAll(uncertain)) {
    const token = hit[2]!;
    if (![...detected].some((name) => name.toUpperCase().replace(/[^A-Z0-9]/g, "") === token)) unresolved.add(token);
  }
  return { series: [...detected], unresolved: [...unresolved] };
}
