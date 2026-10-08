import type { Field } from '@/lib/submittal-lite/records';

/** Both reply workflows use the same project header in easy and table views. */
export function ReplyDocumentHeader({title,fields}:{title:string;fields:Field[]}){
 return <div className="rounded-lg border border-blue-300 bg-blue-100 p-3 text-slate-900">
  <h3 className="text-center font-bold underline">{title}</h3>
  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{fields.filter(f=>f.value.trim()).map((f,i)=><div key={i} className="min-w-0 break-words"><dt className="inline font-semibold">{f.label}: </dt><dd className="inline">{f.value}</dd></div>)}</dl>
 </div>;
}
