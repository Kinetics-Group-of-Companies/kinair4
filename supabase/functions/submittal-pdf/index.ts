import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
Deno.serve(async(req)=>{
 const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type"};
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization");if(!auth)throw new Error("Authentication required");
  const scoped=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {packageId,preview=false}=await req.json();
  const {data:p,error:pe}=await scoped.from("submittal_packages").select("*").eq("id",packageId).single();if(pe)throw pe;
  const {data:files,error:fe}=await scoped.from("submittal_attachments").select("*").eq("package_id",packageId).order("sort_order");if(fe)throw fe;
  const out=await PDFDocument.create();const font=await out.embedFont(StandardFonts.Helvetica);const bold=await out.embedFont(StandardFonts.HelveticaBold);
  const page=out.addPage([595.28,841.89]);page.drawRectangle({x:0,y:760,width:595.28,height:82,color:rgb(.02,.32,.62)});
  page.drawText("KINAIR",{x:44,y:790,size:24,font:bold,color:rgb(1,1,1)});page.drawText((p.package_type==="om"?"OPERATION & MAINTENANCE":p.package_type==="pq"?"PRE-QUALIFICATION":"MATERIAL")+" SUBMITTAL",{x:44,y:700,size:20,font:bold,color:rgb(.02,.25,.5)});
  [["Project",p.project_name],["Reference",p.reference||"-"],["Revision",String(p.revision)],["Material",p.material||"-"],["Client",p.client_name||"-"],["Consultant",p.consultant_name||"-"],["Main Contractor",p.main_contractor_name||"-"],["Submission Date",p.submission_date]].forEach(([k,v],i)=>{page.drawText(k,{x:44,y:640-i*42,size:10,font:bold});page.drawText(String(v).slice(0,70),{x:170,y:640-i*42,size:10,font})});
  let last="";
  for(const f of files??[]){
   if(f.section_name!==last){last=f.section_name;const d=out.addPage([595.28,841.89]);d.drawRectangle({x:0,y:0,width:595.28,height:841.89,color:rgb(.95,.98,1)});d.drawText(last,{x:55,y:420,size:24,font:bold,color:rgb(.02,.32,.62)})}
   const {data:b,error:be}=await admin.storage.from("submittal-control").download(f.storage_path);if(be)throw be;
   const source=await PDFDocument.load(await b.arrayBuffer());const copied=await out.copyPages(source,source.getPageIndices());copied.forEach(x=>out.addPage(x));
  }
  const total=out.getPageCount();out.getPages().forEach((pg,i)=>pg.drawText(`${i+1} / ${total}`,{x:510,y:20,size:8,font,color:rgb(.4,.4,.4)}));
  const bytes=await out.save();const path=`${p.tenant_id}/generated/${p.id}-R${p.revision}.pdf`;
  if(!preview){const {error:ue}=await admin.storage.from("submittal-control").upload(path,bytes,{contentType:"application/pdf",upsert:true});if(ue)throw ue;await scoped.from("submittal_packages").update({status:"generated",output_storage_path:path,updated_at:new Date().toISOString()}).eq("id",p.id)}
  return new Response(bytes,{headers:{...cors,"Content-Type":"application/pdf","Content-Disposition":`${preview?"inline":"attachment"}; filename="${p.reference||"submittal"}-R${p.revision}.pdf"`}});
 }catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:"Generation failed"}),{status:400,headers:{...cors,"Content-Type":"application/json"}})}
});