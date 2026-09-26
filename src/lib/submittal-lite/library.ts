import { idbGet, idbSet } from "@/lib/submittal-lite/idb";

export type Slot = "cover" | "index" | "divider";
export type Doc = { id: string; name: string; type: string; category: string; size?: number; pages?: number };
export type Company = { id: string; name: string; logo?: string | undefined; stamp?: string | undefined; tpl: Partial<Record<Slot, { name: string; type: string; size?: number | undefined }>>; docs: Doc[] };
export type Series = { id: string; name: string; docs: Doc[] };
export type Brand = { id: string; name: string; logo?: string | undefined; docs: Doc[]; series: Series[] };

export const companyCategories = ["Company Profile", "Trade License", "Organization Chart", "ISO Certificate", "Draft Warranty Certificate", "Product Certificate", "Test Certificate", "Other"];
export const brandCategories = ["Manufacturer Profile", "ISO Certificate", "Product Certificate", "Country of Origin", "Manufacturer Authorization Letter", "Approval Copies", "Project Reference List", "Other"];
export const productCategories = ["Catalogue", "Technical Data Sheet", "O&M Manual", "Test Certificate", "Approval Copy", "Project Reference List", "Warranty", "Compliance Statement", "Other"];

export const uid = () => Math.random().toString(36).slice(2, 10);
export const tplKey = (companyId: string, slot: Slot) => `tpl:${companyId}:${slot}`;

type OldDoc = { id: string; name: string; type: string; category: string; brand: string; product: string };

// Loads companies/brands; on first run moves the old single-company settings in.
export async function loadLibrary(): Promise<{ companies: Company[]; brands: Brand[] }> {
  const c = localStorage.getItem("submittals:companies");
  const b = localStorage.getItem("submittals:brands");
  if (c && b) return { companies: JSON.parse(c), brands: JSON.parse(b) };

  const old = JSON.parse(localStorage.getItem("submittals:brand") ?? "{}") as { company?: string; logo?: string; stamp?: string };
  const oldTpl = JSON.parse(localStorage.getItem("submittals:tpl2") ?? "{}") as Company["tpl"];
  const oldDocs = JSON.parse(localStorage.getItem("submittals:docs") ?? "[]") as OldDoc[];
  const logos = JSON.parse(localStorage.getItem("submittals:brandlogos") ?? "{}") as Record<string, string>;
  const company: Company = { id: uid(), name: old.company?.trim() || "My company", logo: old.logo, stamp: old.stamp, tpl: {}, docs: [] };
  for (const s of ["cover", "index", "divider"] as Slot[]) {
    const meta = oldTpl[s];
    const bytes = meta && (await idbGet(`tpl:${s}`));
    if (meta && bytes) { await idbSet(tplKey(company.id, s), bytes, meta.type); company.tpl[s] = meta; }
  }
  const brands: Brand[] = [];
  for (const d of oldDocs) {
    const doc: Doc = { id: d.id, name: d.name, type: d.type, category: d.category };
    if (!d.brand) { company.docs.push(doc); continue; }
    let br = brands.find((x) => x.name.toLowerCase() === d.brand.toLowerCase());
    if (!br) { br = { id: uid(), name: d.brand, logo: logos[d.brand.toLowerCase()], docs: [], series: [] }; brands.push(br); }
    if (!d.product) { br.docs.push(doc); continue; }
    let se = br.series.find((x) => x.name.toLowerCase() === d.product.toLowerCase());
    if (!se) { se = { id: uid(), name: d.product, docs: [] }; br.series.push(se); }
    se.docs.push(doc);
  }
  return { companies: [company], brands };
}

export function saveLibrary(companies: Company[], brands: Brand[]) {
  localStorage.setItem("submittals:companies", JSON.stringify(companies));
  localStorage.setItem("submittals:brands", JSON.stringify(brands));
}

// Typed document intent is more reliable than matching generic words such as "certificate".
const normalize = (text: string) => text.toLowerCase()
  .replace(/certif(?:icate|cation|cate|cates|ications?)/g, "certificate")
  .replace(/certficate|certifcate|cerificate/g, "certificate")
  .replace(/statments?|statemants?/g, "statement")
  .replace(/performnce|perfomance/g, "performance")
  .replace(/waranty|warrenty/g, "warranty")
  .replace(/\bspecs?\b/g, "specification")
  .replace(/catalogues?|catalogs?|catlogues?/g, "catalogue")
  .replace(/data\s*sheets?|datasheets?|tds\b/g, "datasheet")
  .replace(/test\s*reports?|testing\s*reports?/g, "test report")
  .replace(/guarantee/g, "warranty")
  .replace(/\bis0\b|\bi\s*s\s*o\b/g, "iso")
  .replace(/\bo\s*&\s*m\b/g, "operation maintenance")
  .replace(/[^a-z0-9]+/g, " ").trim();

type Intent = "iso" | "test" | "warranty" | "compliance" | "project-spec" | "general-spec" |
  "datasheet" | "catalogue" | "approval" | "manufacturer-profile" | "company-profile" |
  "license" | "manual" | "reference" | "financial" | "organization" | "product-cert" | "origin" | "membership";

function intent(value: string): Intent | undefined {
  const t = normalize(value);
  if (/\bmembership\b|\bmember\s*plaque\b|\bmemberplaque/.test(t)) return "membership";
  if (/\biso\b|\biso\s*(?:9001|14001|45001)\b|\bquality management system\b/.test(t)) return "iso";
  if (/\bwarranty\b/.test(t)) return "warranty";
  if (/\bcompliance\b|\bconformity\b|\bdeviation\b/.test(t)) return "compliance";
  if (/\bproject\s+(?:technical\s+)?specification\b/.test(t)) return "project-spec";
  if (/\bgeneral\s+specification\b/.test(t)) return "general-spec";
  if (/\btest\b|\btesting\b|\bperformance\b|\blaboratory\b|\blab report\b/.test(t)) return "test";
  if (/\b(?:technical\s+)?datasheet\b|\btechnical data\b|\bproduct data\b/.test(t)) return "datasheet";
  if (/\bcatalogue\b|\bbrochure\b/.test(t)) return "catalogue";
  if (/\bapprovals?\b|\bapproved\b/.test(t)) return "approval";
  if (/\bmanufacturer\s+profile\b/.test(t)) return "manufacturer-profile";
  if (/\bcompany\s+profile\b/.test(t)) return "company-profile";
  if (/\btrade\s+licen[cs]e\b/.test(t)) return "license";
  if (/\boperation\b|\bmaintenance\b|\bmanual\b/.test(t)) return "manual";
  if (/\breference\b|\bexperience\b/.test(t)) return "reference";
  if (/\bfinancial\b/.test(t)) return "financial";
  if (/\borganization\b|\borganisation\b|\borg chart\b/.test(t)) return "organization";
  if (/\bproduct\s+certificate\b|\bce\s+certificate\b|\bcb\s+certificate\b/.test(t)) return "product-cert";
  if (/\bcountry\s+of\s+origin\b|\borigin\s+certificate\b/.test(t)) return "origin";
}

const generic = new Set(["certificate", "letter", "report", "document", "sheet", "draft", "the", "and", "for", "copy", "list", "other", "product", "project", "general"]);
const distinct = (text: string) => normalize(text).split(" ").filter((w) => w.length > 2 && !generic.has(w));

export function matches(sectionTitle: string, d: Doc) {
  const sectionType = intent(sectionTitle);
  // A deliberate library category takes priority over a possibly vague filename.
  const categoryType = d.category && d.category !== "Other" ? intent(d.category) : undefined;
  const filenameType = intent(d.name);
  // A broad default profile category should not hide an explicitly named certificate.
  const typedDocument = filenameType === "membership" || (filenameType && (categoryType === "company-profile" || categoryType === "manufacturer-profile") && filenameType !== categoryType)
    ? filenameType : (categoryType ?? filenameType);
  const documentType = typedDocument === "product-cert" ? (filenameType === "iso" ? "iso" : "test") : typedDocument;
  if (sectionType || documentType) return Boolean(sectionType && documentType && sectionType === documentType);
  const sectionWords = distinct(sectionTitle);
  const documentWords = distinct(d.category && d.category !== "Other" ? d.category : d.name);
  return sectionWords.length > 0 && documentWords.length > 0 &&
    (sectionWords.every((w) => documentWords.includes(w)) || documentWords.every((w) => sectionWords.includes(w)));
}
