// Model availability and price are separate: discovery never proves a model is cheap.
export type ModelRow = {provider:string; model_id:string; tier:string; cost_rank:number; enabled?:boolean; metadata?:Record<string,any>};
export type Rate = {provider:string; model:string; input_usd:number; output_usd:number};
export const providerName = (p:string) => p === 'google' ? 'gemini' : p;
export function eligibleModels(rows:ModelRow[], rates:Rate[], now=Date.now()):ModelRow[] {
  const rateFor=(m:ModelRow)=>rates.find(r=>providerName(r.provider)===providerName(m.provider)&&r.model===m.model_id);
  const valid=(r:Rate|undefined)=>!!r&&Number.isFinite(Number(r.input_usd))&&Number.isFinite(Number(r.output_usd))&&Number(r.input_usd)>=0&&Number(r.output_usd)>=0;
  return rows.filter(m=>{
    if (Number(m.metadata?.unavailable_until || 0)>now) return false;
    // Never override an explicit disabled model, even if a saved price exists.
    if (!m.enabled) return false;
    if(m.metadata?.pricing_status==='unverified' && !valid(rateFor(m)))return false;
    return !/preview|experimental|search|codex|computer|realtime|audio|image/i.test(m.model_id);
  }).sort((a,b)=>{
    const ar=rateFor(a),br=rateFor(b);
    if(valid(ar)&&valid(br)) {
      // Submittal work is output-heavy. Equal price prefers the newer version.
      const delta=(Number(ar!.input_usd)+2*Number(ar!.output_usd))-(Number(br!.input_usd)+2*Number(br!.output_usd));
      if(delta)return delta;
    } else if(valid(ar)!==valid(br)) return valid(ar)?-1:1;
    return a.cost_rank-b.cost_rank || Number(b.model_id.endsWith('-latest'))-Number(a.model_id.endsWith('-latest')) || b.model_id.localeCompare(a.model_id,undefined,{numeric:true});
  });
}
export function failureKind(error:any):'unavailable'|'quota'|'other' {
  const status=Number(error?.statusCode || error?.status || error?.cause?.statusCode);
  if(status===429)return 'quota';
  if((status===404||status===410)||/model.{0,80}(not found|does not exist|deprecated|retired|not supported|no longer available)/i.test(String(error?.message||error)))return 'unavailable';
  return 'other';
}
let refreshAfter=0;
let forcedRefreshAfter=0;
export async function refreshRegistry(authorization:string, force=false) {
  if(force ? Date.now()<forcedRefreshAfter : Date.now()<refreshAfter)return;
  if(force)forcedRefreshAfter=Date.now()+5*60*1000;
  else refreshAfter=Date.now()+5*60*1000;
  try {
    const response=await fetch(Deno.env.get('SUPABASE_URL')+'/functions/v1/ai-model-registry'+(force?'?refresh=1':''),{
      method:'POST',headers:{Authorization:authorization,apikey:Deno.env.get('SUPABASE_ANON_KEY')!},signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)console.warn('Model discovery unavailable',response.status);
  }catch{console.warn('Model discovery unavailable; retaining saved models');}
}
