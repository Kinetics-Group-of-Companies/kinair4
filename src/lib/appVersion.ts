/**
 * Version of this build of the app / desktop software.
 * Bump this whenever a new desktop installer is packaged and published
 * to the Downloads page, so installed copies can detect the update.
 */
export const APP_VERSION = 'v14';

/** Compare two version strings like "v11" / "1.2.3". Returns >0 when a is newer. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    (v || '')
      .replace(/^[vV]/, '')
      .split(/[.\-_]/)
      .map((p) => parseInt(p.replace(/\D/g, ''), 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
