import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { QuickReplyComposer } from './QuickReplyComposer';

export function InlineQuickReplies({reply,onChange}:{reply:string;onChange:(value:string)=>void}){
 const [open,setOpen]=useState(false);
 const [undo,setUndo]=useState<{before:string;after:string}>();
 return <div className="my-3 space-y-2">
  <Button type="button" variant="outline" className="min-h-11" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Hide quick replies':'Quick replies — select multiple'}</Button>
  {open&&<QuickReplyComposer onInsert={text=>{const after=reply.trim()?reply+'\n\n'+text:text;setUndo({before:reply,after});onChange(after);setOpen(false);}}/>}
  {undo?.after===reply&&<Button type="button" variant="outline" className="min-h-11" onClick={()=>{onChange(undo.before);setUndo(undefined);}}>Undo quick reply</Button>}
 </div>;
}
