import { idbGet, idbSet } from "@/lib/submittal-lite/idb";

export type Slot = "cover" | "index" | "divider";
export type Doc = { libraryScope?: "company"; id: string; name: string; type: string; category: string; size?: number; pages?: number };
export type Company = { id: string; name: string; logo?: string | undefined; stamp?: string | undefined; tpl: Partial<Record<Slot, { name: string; type: string; size?: number | undefined }>>; docs: Doc[] };
export type Series = { id: string; name: string; docs: Doc[] };
export type Brand = { id: string; name: string; logo?: string | undefined; docs: Doc[]; series: Series[] };

export const companyCategories = ["Company Profile", "Trade License", "Organization Chart", "ISO Certificate", "Draft Warranty Certificate", "Product Certificate", "Test Certificate", "Membership Certificate", "Previous Project Approvals", "Project Reference List", "Other"];
export const brandCategories = ["Manufacturer Profile", "ISO Certificate", "Product Certificate", "Country of Origin", "Manufacturer Authorization Letter", "Approval Copies", "Project Reference List", "Catalogue", "Installation Guide", "General Compliance Statement", "Test Certificate", "Draft Warranty Certificate", "Other"];
export const productCategories = ["Catalogue", "Technical Data Sheet", "O&M Manual", "Test Certificate", "Approval Copy", "Project Reference List", "Warranty", "General Compliance Statement", "Installation Guide", "Country of Origin", "Other"];

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
  .replace(/refernce/g, "reference")
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
  "authorization" | "schedule" | "license" | "manual" | "reference" | "financial" | "organization" | "product-cert" | "origin" | "membership";

// Curated from the KINAIR index-training references. These are heading
// aliases, not loose substring matches: document content retains its specific type.
export const indexTrainingAliases: Partial<Record<Intent, string[]>> = {
  "company-profile": [
    "About Company",
    "About Us",
    "Company Background",
    "Company Credentials",
    "Company Details",
    "Company Information",
    "Company Introduction",
    "Company Overview",
    "Company Profile",
    "Corporate Credentials",
    "Corporate Introduction",
    "Corporate Profile",
    "Manufacturer Profile",
    "Organization Profile",
    "Supplier Profile",
    "Vendor Profile"
  ],
  "schedule": [
    "Air Curtain Schedule",
    "Equipment List",
    "Equipment Schedule",
    "Equipment Schedules",
    "Equipment Selection Schedule",
    "Fan Schedule",
    "Fans Schedule",
    "Material List",
    "Material Schedule",
    "Material Schedules",
    "Material Selection Schedule",
    "Materials List",
    "Materials Schedule",
    "Product List",
    "Product Schedule",
    "Product Schedules",
    "Schedule",
    "Schedule of Equipment",
    "Schedule of Materials",
    "Selected Equipment Schedule",
    "Selection Schedule",
    "Technical Schedule",
    "Ventilation Schedule"
  ],
  "catalogue": [
    "Brochure",
    "Brochures",
    "Catalog",
    "Catalogue",
    "General Catalogue",
    "Manufacturer Catalog",
    "Manufacturer Catalogue",
    "Product Brochure",
    "Product Brochures",
    "Product Catalog",
    "Product Catalogue",
    "Product Details",
    "Product Information",
    "Product Leaflet",
    "Product Leaflets",
    "Product Literature",
    "Product Overview",
    "Product Range",
    "Technical Catalog",
    "Technical Catalogue"
  ],
  "datasheet": [
    "Data Sheet",
    "Data Sheets",
    "Datasheet",
    "Datasheets",
    "Equipment Data Sheet",
    "Equipment Datasheet",
    "Performance Data",
    "Product Data Sheet",
    "Product Data Sheets",
    "Product Datasheet",
    "Product Selection Data",
    "Product Technical Data",
    "Selection Data",
    "Specification Sheet",
    "TDS",
    "Tech Data Sheet",
    "Technical Data",
    "Technical Data Sheet",
    "Technical Data Sheets",
    "Technical Datasheet",
    "Technical Datasheets",
    "Technical Details",
    "Technical Information",
    "Technical Specification Sheet",
    "Technical Specification Sheets"
  ],
  "project-spec": [
    "Consultant Specification",
    "Consultant Specifications",
    "Contract Specification",
    "Contract Specifications",
    "Employer Requirements",
    "Employer Specification",
    "HVAC Specification",
    "HVAC Specifications",
    "MEP Specification",
    "MEP Specifications",
    "Particular Specification",
    "Particular Specifications",
    "Project Spec",
    "Project Specification",
    "Project Specifications",
    "Project Specs",
    "Project Technical Specification",
    "Specification",
    "Specifications",
    "Technical Specification",
    "Technical Specifications",
    "Tender Specification",
    "Tender Specifications"
  ],
  "compliance": [
    "Clause Wise Compliance",
    "Clause-by-Clause Compliance",
    "Compliance",
    "Compliance & Deviation Statement",
    "Compliance Document",
    "Compliance Matrix",
    "Compliance Report",
    "Compliance Schedule",
    "Compliance Sheet",
    "Compliance Sheets",
    "Compliance Statement",
    "Compliance Statements",
    "Compliance Statment",
    "Compliance Table",
    "Compliance to Specification",
    "Compliance with Specification",
    "Deviation Statement",
    "General Compliance",
    "General Compliance Certificate",
    "General Compliance Declaration",
    "General Compliance Matrix",
    "General Compliance Report",
    "General Compliance Schedule",
    "General Compliance Sheet",
    "General Compliance Statement",
    "General Compliance Statment",
    "General Specification Compliance",
    "General Specification Compliance Statement",
    "General Statement of Compliance",
    "General Technical Compliance",
    "General Technical Compliance Matrix",
    "General Technical Compliance Statement",
    "Point-by-Point Compliance",
    "Product Compliance",
    "Product Compliance Sheet",
    "Product Compliance Statement",
    "Project Compliance Statement",
    "Specification Compliance",
    "Specification Compliance Statement",
    "Standard Compliance",
    "Standard Compliance Statement",
    "Statement of Compliance",
    "Technical Compliance",
    "Technical Compliance Matrix",
    "Technical Compliance Statement"
  ],
  "test": [
    "Factory Test Certificate",
    "Factory Test Report",
    "Independent Test Report",
    "Lab Test Report",
    "Laboratory Reports",
    "Laboratory Test Report",
    "Performance Test Certificate",
    "Performance Test Report",
    "Product Test Report",
    "Test & Certification",
    "Test Certificate",
    "Test Certificates",
    "Test Certificates & Reports",
    "Test Documentation",
    "Test Report",
    "Test Report & Certificate",
    "Test Reports",
    "Test Reports & Test Certificates",
    "Test Reports and Test Certificates",
    "Testing Certificates",
    "Testing Documentation",
    "Testing Reports",
    "Third Party Test Certificate",
    "Third Party Test Report",
    "Type Test Certificate",
    "Type Test Report"
  ],
  "warranty": [
    "Draft Warranty",
    "Draft Warranty Certificate",
    "Guarantee",
    "Guarantee Certificate",
    "Manufacturer Warranty",
    "Manufacturer Warranty Certificate",
    "Manufacturer's Warranty",
    "Proposed Warranty",
    "Supplier Warranty",
    "Supplier Warranty Letter",
    "Warranty",
    "Warranty Certificate",
    "Warranty Commitment",
    "Warranty Confirmation",
    "Warranty Declaration",
    "Warranty Draft",
    "Warranty Letter",
    "Warranty Statement",
    "Warranty Terms",
    "Warranty Terms & Conditions",
    "Warranty Terms and Conditions",
    "Warranty Undertaking"
  ],
  "license": [
    "Business Licence",
    "Business License",
    "Business Registration",
    "CR Certificate",
    "Commercial Licence",
    "Commercial License",
    "Commercial Registration",
    "Commercial Registration Certificate",
    "Company Legal Documents",
    "Company Registration",
    "Company Trade Licence",
    "Company Trade License",
    "Manufacturer Trade License",
    "Registration Certificate",
    "Supplier Trade License",
    "Trade Certificate",
    "Trade Licence",
    "Trade Licence Copy",
    "Trade License",
    "Trade License Copy",
    "Trading Licence",
    "Trading License",
    "Valid Trade Certificate",
    "Valid Trade Licence",
    "Valid Trade License",
    "Vendor Trade License"
  ],
  "iso": [
    "ISO 14001 Certificate",
    "ISO 45001 Certificate",
    "ISO 9001 Certificate",
    "ISO 9001:2015 Certificate",
    "ISO Accreditation",
    "ISO Cert",
    "ISO Certificate",
    "ISO Certificates",
    "ISO Certification",
    "ISO Certification Documents",
    "ISO Certifications",
    "ISO Documents",
    "International Certification",
    "Management System Certificates",
    "QMS Certificate",
    "Quality Certificate",
    "Quality Certification",
    "Quality Management Certificate",
    "Quality Management System Certificate",
    "Valid ISO Certificate",
    "Valid ISO Certificates"
  ],
  "approval": [
    "Approved Projects",
    "Authority Approvals",
    "Client Approvals",
    "Completed Projects",
    "Consultant Approvals",
    "Experience List",
    "List of Projects",
    "Major Projects",
    "Past Approvals",
    "Past Project Approvals",
    "Past Projects",
    "Previous Approval",
    "Previous Approval Copies",
    "Previous Approvals",
    "Previous Authority Approvals",
    "Previous Client Approvals",
    "Previous Consultant Approval",
    "Previous Consultant Approvals",
    "Previous Experience",
    "Previous Project Approval Copies",
    "Previous Project Approvals",
    "Previous Project List",
    "Previous Project References",
    "Previous Projects Approvals",
    "Previously Approved Projects",
    "Project Approvals",
    "Project Experience",
    "Project List",
    "Project Reference",
    "Project References",
    "Reference List",
    "Reference Projects",
    "Similar Project References",
    "Similar Projects",
    "Track Record"
  ],
  "manual": [
    "Installation Guide",
    "Installation Guidelines",
    "Installation Manual",
    "Installation Manuals",
    "Installation Instructions",
    "Installation Instruction",
    "Installation Procedure",
    "Installation Procedures",
    "Installation Method",
    "Installation Methods",
    "Installation Methodology",
    "Installation Details",
    "Installation Information",
    "Installation Requirements",
    "Installation Recommendations",
    "Installation Handbook",
    "Installation & Operation Manual",
    "Installation and Operation Manual",
    "Installation, Operation & Maintenance Manual",
    "Installation Operation and Maintenance Manual",
    "Installation, Operation and Maintenance Manual",
    "IOM Manual",
    "IOM",
    "IOM Guide",
    "Operation & Installation Manual",
    "Operation and Installation Manual",
    "Operation Manual",
    "Operating Manual",
    "User Manual",
    "Product Manual",
    "Technical Manual",
    "Equipment Manual",
    "Manufacturer Installation Guide",
    "Manufacturer Installation Manual",
    "Manufacturer Instructions",
    "Mounting Guide",
    "Mounting Instructions",
    "Mounting Manual",
    "Erection Guide",
    "Erection Instructions",
    "Erection Manual",
    "Assembly Guide",
    "Assembly Instructions",
    "Assembly Manual",
    "Installation & Maintenance Manual",
    "Installation and Maintenance Manual",
    "Operation & Maintenance Manual",
    "Operation and Maintenance Manual",
    "O&M Manual",
    "Maintenance & Installation Guide",
    "Installation Drawing",
    "Installation Drawings",
    "Typical Installation",
    "Typical Installation Details",
    "Typical Mounting Details"
  ],
  "origin": [
    "Country of Origin",
    "Country Of Origin",
    "Country Origin",
    "Origin",
    "Product Origin",
    "Product Country of Origin",
    "Equipment Country of Origin",
    "Material Country of Origin",
    "Manufacturer Country of Origin",
    "Country of Manufacture",
    "Country of Manufacturing",
    "Manufacturing Country",
    "Place of Manufacture",
    "Place of Manufacturing",
    "Manufacturing Origin",
    "Origin of Manufacture",
    "Origin of Manufacturing",
    "Origin Country",
    "Country of Production",
    "Production Country",
    "Place of Production",
    "Made In",
    "Made-in",
    "Made in Certificate",
    "Made In Certificate",
    "Certificate of Origin",
    "Certificate Of Origin",
    "Origin Certificate",
    "Country of Origin Certificate",
    "Country of Origin Declaration",
    "Declaration of Origin",
    "Origin Declaration",
    "Manufacturer Origin Declaration",
    "Manufacturer Declaration of Origin",
    "Product Origin Declaration",
    "Material Origin Declaration",
    "COO",
    "COO Certificate",
    "COO Declaration",
    "C/O",
    "C.O.O.",
    "Certificate of Country of Origin",
    "Country of Origin Statement",
    "Origin Statement",
    "Manufacturing Origin Statement",
    "Country of Origin Details",
    "Origin Details",
    "Manufacturing Location",
    "Manufacturing Location Declaration"
  ],
  "authorization": [
    "Manufacturer's Authorization Letter",
    "Manufacturer\u2019s Authorization Letter",
    "Manufacturers Authorization Letter",
    "Manufacturer Authorization Letter",
    "Manufacturer's Authorisation Letter",
    "Manufacturer\u2019s Authorisation Letter",
    "Manufacturer Authorisation Letter",
    "Manufacturer Authorization",
    "Manufacturer Authorisation",
    "Manufacturer's Authorization",
    "Manufacturer\u2019s Authorization",
    "Manufacturer's Authorisation",
    "Manufacturer\u2019s Authorisation",
    "Authorization Letter",
    "Authorisation Letter",
    "Letter of Authorization",
    "Letter of Authorisation",
    "Manufacturer Letter of Authorization",
    "Manufacturer Letter of Authorisation",
    "Manufacturer Authorization Certificate",
    "Manufacturer Authorisation Certificate",
    "Manufacturer's Authorization Certificate",
    "Manufacturer\u2019s Authorization Certificate",
    "Manufacturer Appointment Letter",
    "Manufacturer's Appointment Letter",
    "Manufacturer\u2019s Appointment Letter",
    "Appointment Letter",
    "Authorized Distributor Letter",
    "Authorised Distributor Letter",
    "Distributor Authorization Letter",
    "Distributor Authorisation Letter",
    "Distributor Appointment Letter",
    "Authorized Dealer Letter",
    "Authorised Dealer Letter",
    "Dealer Authorization Letter",
    "Dealer Authorisation Letter",
    "Authorized Agent Letter",
    "Authorised Agent Letter",
    "Agent Authorization Letter",
    "Agent Authorisation Letter",
    "Agency Authorization Letter",
    "Agency Authorisation Letter",
    "Supplier Authorization Letter",
    "Supplier Authorisation Letter",
    "Vendor Authorization Letter",
    "Vendor Authorisation Letter",
    "Manufacturer Representation Letter",
    "Representation Authorization Letter",
    "Manufacturer Declaration of Authorization",
    "Manufacturer Declaration of Authorisation",
    "Authorization Certificate",
    "Authorisation Certificate",
    "MAL",
    "MAF",
    "Manufacturer Authorization Form",
    "Manufacturer's Authorization Form",
    "Manufacturer Authorisation Form",
    "OEM Authorization Letter",
    "OEM Authorisation Letter",
    "OEM Authorization",
    "OEM Authorisation",
    "Principal Authorization Letter",
    "Principal Authorisation Letter",
    "Factory Authorization Letter",
    "Factory Authorisation Letter"
  ]
};
const headingKey = (value: string) => normalize(normalize(value.replace(/\.(?:pdf|docx?|xlsx?)$/i, "")))
  .replace(/\b(?:sheets|reports|certificates|schedules|specifications|materials)\b/g, word => word.slice(0, -1));
const headingAliases = new Map<string, Intent>();
for (const [type, aliases] of Object.entries(indexTrainingAliases)) {
  for (const alias of aliases ?? []) headingAliases.set(headingKey(alias), type as Intent);
}
export function indexHeadingIntent(value: string): Intent | undefined {
  return headingAliases.get(headingKey(value));
}
function complianceScope(value: string): "general" | "project" | undefined {
  const text = normalize(value);
  if (!/compliance|conformity|deviation/.test(text)) return undefined;
  if (/\bproject\b|\bclause\b|\bpoint by point\b|\bspecification\b/.test(text) && !/\bgeneral\b/.test(text)) return "project";
  if (/\bgeneral\b|\bproduct\b|\bstandard\b/.test(text)) return "general";
}

function intent(value: string): Intent | undefined {
  const alias = indexHeadingIntent(value);
  if (alias) return alias;
  const t = normalize(value);
  if (/\bmembership\b|\bmember\s*plaque\b|\bmemberplaque/.test(t)) return "membership";
  if (/\biso\b|\biso\s*(?:9001|14001|45001)\b|\bquality management system\b/.test(t)) return "iso";
  if (/\bwarranty\b/.test(t)) return "warranty";
  if (/\bcompliance\b|\bconformity\b|\bdeviation\b/.test(t)) return "compliance";
  if (/\bproject\s+(?:technical\s+)?specification\b/.test(t)) return "project-spec";
  if (/\bgeneral\s+specification\b/.test(t)) return "general-spec";
  if (/\btest\b|\btesting\b|\bperformance (?:test|certificate|report)\b|\blaboratory\b|\blab report\b/.test(t)) return "test";
  if (/\b(?:technical\s+)?datasheet\b|\btechnical data\b|\bproduct data\b|\bperformance data\b/.test(t)) return "datasheet";
  if (/\bcatalogue\b|\bbrochure\b/.test(t)) return "catalogue";
  if (/\bapprovals?\b|\bapproved\b/.test(t)) return "approval";
  if (/\bmanufacturer\s+profile\b/.test(t)) return "manufacturer-profile";
  if (/\bcompany\s+profile\b/.test(t)) return "company-profile";
  if (/\b(?:material|equipment)\s+schedule\b/.test(t)) return "schedule";
  if (/\bauthori[sz]ation\b/.test(t)) return "authorization";
  if (/\btrade\s+(?:licen[cs]e|certificate)\b/.test(t)) return "license";
  if (/\binstallation\b|\boperation\b|\bmaintenance\b|\bmanual\b/.test(t)) return "manual";
  if (/\breference\b|\bexperience\b/.test(t)) return "reference";
  if (/\bfinancial\b/.test(t)) return "financial";
  if (/\borganization\b|\borganisation\b|\borg chart\b/.test(t)) return "organization";
  if (/\bproduct\s+certificate\b|\bce\s+certificate\b|\bcb\s+certificate\b/.test(t)) return "product-cert";
  if (/\bcountry\s+of\s+origin\b|\borigin\s+certificate\b/.test(t)) return "origin";
}

const generic = new Set(["certificate", "letter", "report", "document", "sheet", "draft", "the", "and", "for", "copy", "list", "other", "product", "project", "general"]);
const distinct = (text: string) => normalize(text).split(" ").filter((w) => w.length > 2 && !generic.has(w));

export function isCompanyCertificate(doc: Doc): boolean {
  if (doc.libraryScope !== "company") return false;
  const purpose = intent(doc.category !== "Other" ? doc.category : doc.name);
  // Scope applies across products; it does not change a document's purpose.
  if (["warranty", "trade", "origin", "authorization"].includes(purpose ?? "") ||
      /warranty|trade\s*(?:licen[cs]e|certificat)|country\s*of\s*origin|authori[sz]ation/i.test(`${doc.category} ${doc.name}`)) return false;
  return /certificat|membership|member[ -]?plaque/i.test(`${doc.category} ${doc.name}`);
}

export function matches(sectionTitle: string, d: Doc) {
  const detectedSectionType = intent(sectionTitle);
  const sectionType = detectedSectionType === "product-cert" ? "test" : detectedSectionType;
  // A deliberate library category takes priority over a possibly vague filename.
  const categoryType = d.category && d.category !== "Other" ? intent(d.category) : undefined;
  const filenameType = intent(d.name);
  // A broad default profile category should not hide an explicitly named certificate.
  const typedDocument = filenameType === "membership" || (filenameType && (categoryType === "company-profile" || categoryType === "manufacturer-profile") && filenameType !== categoryType)
    ? filenameType : (categoryType ?? filenameType);
  const documentType = typedDocument === "product-cert" ? (filenameType === "iso" ? "iso" : "test") : typedDocument;
  // Company-level uploads are explicitly shared across all products. Include
  // certificates in the test/certificate package without relabelling their content.
  if (isCompanyCertificate(d) && (sectionType === "test" || (!sectionType && /^certificates?$/i.test(sectionTitle.trim())))) return true;
  if (sectionType === "compliance" && documentType === "compliance") {
    const requested = complianceScope(sectionTitle);
    const supplied = complianceScope(d.name) ?? complianceScope(d.category);
    // A generic library category cannot turn a general statement into project compliance.
    if (requested && supplied && requested !== supplied) return false;
    if (requested === "project" && supplied !== "project") return false;
  }
  if (sectionType === "approval" && documentType === "reference" && /reference|refernce/i.test(sectionTitle)) return true;
  if (sectionType || documentType) return Boolean(sectionType && documentType && sectionType === documentType);
  const sectionWords = distinct(sectionTitle);
  const documentWords = distinct(d.category && d.category !== "Other" ? d.category : d.name);
  return sectionWords.length > 0 && documentWords.length > 0 &&
    (sectionWords.every((w) => documentWords.includes(w)) || documentWords.every((w) => sectionWords.includes(w)));
}
