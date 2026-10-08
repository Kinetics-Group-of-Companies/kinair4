type Props={sourceWidth:number;replyWidth:number;onSourceWidth:(value:number)=>void;onReplyWidth:(value:number)=>void};
export function ReplyTableSizing({sourceWidth,replyWidth,onSourceWidth,onReplyWidth}:Props){
 return <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
  <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Adjust editing columns</strong><button type="button" className="text-sm underline" onClick={()=>{onSourceWidth(420);onReplyWidth(520);}}>Reset widths</button></div>
  <div className="grid gap-4 sm:grid-cols-2">
   <label className="text-sm">Comment / specification width · {sourceWidth}px<input aria-label="Comment or specification column width" className="block w-full mt-2 accent-blue-600" type="range" min={240} max={1200} step={20} value={sourceWidth} onChange={e=>onSourceWidth(Number(e.target.value))}/></label>
   <label className="text-sm">Reply width · {replyWidth}px<input aria-label="Reply column width" className="block w-full mt-2 accent-blue-600" type="range" min={240} max={1200} step={20} value={replyWidth} onChange={e=>onReplyWidth(Number(e.target.value))}/></label>
  </div><p className="text-xs text-muted-foreground">Slide to widen or narrow either column. Scroll the table sideways when wider than your screen. Drag a text box’s bottom corner to adjust its height.</p>
 </div>;
}
