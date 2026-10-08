import { normalizeCoverFields, coverFieldKey } from './cover-fields';
import type { Field, SubmittalRecord } from './records';
/** Reuse project facts only, never carry product selections, approvals or commercial references. */
export function reusableProjectFields(record: Pick<SubmittalRecord, 'fields'>): Field[] {
  return normalizeCoverFields(record.fields).filter(field => /^(projectname|clientname|mepconsultant|maincontractor|mepcontractor|location|plotnolocation|projectnumber|projectno|projectlocation|consultant|architect)$/.test(coverFieldKey(field.label)));
}
export function latestProjects(records: SubmittalRecord[]): SubmittalRecord[] {
  const seen = new Set<string>();
  return [...records].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).filter(record=>{
    const name = reusableProjectFields(record).find(f=>coverFieldKey(f.label)==='projectname')?.value.trim().toLowerCase();
    if (!name || seen.has(name)) return false;
    seen.add(name); return true;
  });
}
