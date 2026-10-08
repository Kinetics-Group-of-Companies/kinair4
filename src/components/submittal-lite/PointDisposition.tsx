import { Button } from '@/components/ui/button';
import type { RtccRow } from '@/lib/submittal-lite/rtcc';
import { suggestPointKind } from '@/lib/submittal-lite/reply-points';

type Props={row:RtccRow;onChange:(patch:Partial<RtccRow>)=>void};
export function PointDisposition({row,onChange}:Props){
 const suggestion=suggestPointKind(row.comment);
 const change=(kind:RtccRow['kind'])=>onChange({kind,noReplyReason:kind==='information'?(row.noReplyReason|| (suggestion.kind==='information'?suggestion.reason:'')):undefined,reviewed:false});
 return <div className="space-y-2 rounded-lg border p-3">
  <label className="block text-sm font-semibold">Does this point need a reply?<select aria-label="Reply requirement" value={row.kind||'requirement'} onChange={e=>change(e.target.value as RtccRow['kind'])} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base"><option value="requirement">Reply required</option><option value="heading">Section heading — no reply</option><option value="information">No reply needed — give reason</option></select></label>
  {suggestion.kind!=='requirement'&&suggestion.kind!==(row.kind||'requirement')&&<div className="text-sm"><p>Suggested: {suggestion.kind==='heading'?'section heading':'no reply needed'}. {suggestion.reason}</p><Button type="button" variant="outline" className="mt-2 min-h-11" onClick={()=>change(suggestion.kind)}>Use suggestion</Button></div>}
  {row.kind==='information'&&<label className="block text-sm">Reason no reply is needed<input aria-label="No reply reason" value={row.noReplyReason||''} onChange={e=>onChange({noReplyReason:e.target.value,reviewed:false})} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-base" placeholder="e.g. reference note only; explain why no response is needed"/></label>}
  {row.kind&&row.kind!=='requirement'&&<p className="text-xs text-muted-foreground">Original wording stays in PDF and Excel. Confirm this classification below. Any existing reply and comparison are retained and restored if you select Reply required.</p>}
 </div>;
}
