import * as XLSX from 'xlsx';
const columns=['Submission Date','Reference','Revision','QTN REF','QTN Value','Customer','Project Name','Material / Category','Client','Consultant','Main Contractor','MEP Contractor','Sales Engineer','Status','Approval','Equipment Tag','Commissioning Date','Warranty Period'];
const row=(p:any)=>[p.submission_date,p.reference??'',p.revision,p.quotation_reference??'',p.quotation_value??'',p.client_name??'',p.project_name,p.material??'',p.client_name??'',p.consultant_name??'',p.main_contractor_name??'',p.subcontractor_name??'',p.sales_engineer??'',p.status,p.approval_status,p.equipment_tag??'',p.commissioning_date??'',p.warranty_period??''];
const sheet=(rows:any[])=>{const ws=XLSX.utils.aoa_to_sheet([columns,...rows.map(row)]);ws['!autofilter']={ref:`A1:R${Math.max(rows.length+1,2)}`};ws['!freeze']={xSplit:0,ySplit:1};ws['!cols']=[12,18,9,18,14,24,38,28,24,24,24,24,18,12,16,20,18,18].map(w=>({wch:w}));return ws};
export function downloadSubmittalWorkbook(packages:any[]){
 const wb=XLSX.utils.book_new();
 const counts={Regular:packages.filter(p=>p.package_type==='regular').length,PQ:packages.filter(p=>p.package_type==='pq').length,'O&M':packages.filter(p=>p.package_type==='om').length,Generated:packages.filter(p=>p.status==='generated').length,Draft:packages.filter(p=>p.status==='draft').length,Approved:packages.filter(p=>p.approval_status==='approved').length};
 const summary=XLSX.utils.aoa_to_sheet([['KINAIR Submittal Control Report'],['Generated',new Date()],[],['Metric','Count'],...Object.entries(counts)]);
 summary['!cols']=[{wch:28},{wch:18}];summary['B2'].z='dd-mm-yyyy hh:mm';
 XLSX.utils.book_append_sheet(wb,summary,'Summary');
 XLSX.utils.book_append_sheet(wb,sheet(packages.filter(p=>p.package_type==='regular')),'Submittals');
 XLSX.utils.book_append_sheet(wb,sheet(packages.filter(p=>p.package_type==='pq')),'PQ Submittals');
 XLSX.utils.book_append_sheet(wb,sheet(packages.filter(p=>p.package_type==='om')),'O&M Submittals');
 XLSX.writeFile(wb,`KINAIR-Submittal-Report-${new Date().toISOString().slice(0,10)}.xlsx`,{compression:true});
}