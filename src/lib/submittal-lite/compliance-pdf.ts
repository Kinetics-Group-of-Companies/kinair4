import type { Field, Section } from './records';
import type { ComplianceSheet } from './compliance';
import { complianceExportTables } from './review-excel';
import { buildReviewPdf, type ReviewPdfBranding } from './review-pdf';

/** PDF and editable Excel share titles, project details, replies and comparisons. */
export async function buildCompliancePdf(sheet: ComplianceSheet, fields: Field[], names: Record<string,string>, branding:ReviewPdfBranding={}): Promise<Uint8Array> {
 const sections: Section[]=[{id:'references',title:'Supporting documents',docs:Object.entries(names).map(([id,name])=>({id,name,type:'application/pdf'}))}];
 return buildReviewPdf(complianceExportTables(sheet,fields,sections),branding);
}
