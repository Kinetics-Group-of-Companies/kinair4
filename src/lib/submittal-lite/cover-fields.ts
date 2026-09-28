export type CoverField = { label: string; value: string };
export const coverFieldKey = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  .replace(/^project$/, "projectname").replace(/^client$/, "clientname")
  .replace(/^consultant$|^consultantname$|^mepconsultantname$/, "mepconsultant")
  .replace(/^hvccontractor$|^hvaccontractor$|^mvpcontractor$/, "mepcontractor")
  .replace(/^supplier$|^submittedby$|^company$/, "suppliername")
  .replace(/^brand$|^manufacturer$|^make$/, "brandname")
  .replace(/^plot(?:no|number)?(?:loc|location)?$/, "plotnolocation");
export const isProvidedCoverValue = (value: string) => Boolean(value.trim()) && !/^[\s(]*(?:not provided|not specified|unspecified|undefined|null|n\/?a|tbd)[\s)]*$/i.test(value);

/** Keep one row per client field; a placeholder must never replace a real value. */
export function normalizeCoverFields(fields: CoverField[], keepEmpty = false): CoverField[] {
  const unique = new Map<string, CoverField>();
  for (const field of fields) {
    const key = coverFieldKey(field.label);
    if (!key) continue;
    const value = isProvidedCoverValue(field.value) ? field.value.trim() : "";
    const previous = unique.get(key);
    if (!previous || (!previous.value && value)) unique.set(key, { label: field.label.trim(), value });
  }
  return [...unique.values()].filter(field => keepEmpty || field.value);
}
