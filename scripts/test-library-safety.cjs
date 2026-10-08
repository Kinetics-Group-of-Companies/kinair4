const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const source=fs.readFileSync('src/lib/submittal-lite/cloud.ts','utf8');
function client(db){
 const supabase={from:()=>{let verb='read',row,filters=[];const q={select:asyncColumns,eq:(k,v)=>{filters.push([k,v]);return q},maybeSingle:async()=>({data:db.row,error:null}),update:r=>{verb='update';row=r;return q},insert:r=>{verb='insert';row=r;return q}};
 function asyncColumns(){if(verb==='read')return q;db.writes++;if(verb==='update'&&filters.some(([k,v])=>db.row[k]!==v))return Promise.resolve({data:[]});if(verb==='insert'&&db.row)return Promise.resolve({error:{code:'23505'}});db.row={...row,updated_at:'version-'+db.writes};delete db.row.data._expectedUpdatedAt;return Promise.resolve({data:[{updated_at:db.row.updated_at}]});}return q;}};
 const raw=source.slice(source.indexOf('const settingsVersions')).replace(/export /g,'');
 return new Function('supabase',ts.transpile(raw,{target:ts.ScriptTarget.ES2022})+';return {loadCloudSettings,putCloudSettings};')(supabase);
}
const settings={companies:[{id:'c',name:'Kinetics',docs:[],tpl:{}}],brands:[{id:'b',name:'KINAIR',docs:[],series:[]}]};
const database=()=>({row:{tenant_id:'t',data:settings,updated_at:'original'},writes:0});
test('opening library does not autosave unchanged settings',async()=>{const db=database(),c=client(db);await c.loadCloudSettings('t');await c.putCloudSettings('t',settings);assert.equal(db.writes,0);});
test('stale session cannot overwrite another session changes',async()=>{const db=database(),a=client(db),b=client(db);await a.loadCloudSettings('t');await b.loadCloudSettings('t');await a.putCloudSettings('t',{...settings,selection:{brandId:'b'}});await assert.rejects(b.putCloudSettings('t',{companies:[],brands:[]}),/older copy was not saved/);assert.equal(db.row.data.brands[0].name,'KINAIR');});
test('workspace not loaded cannot write another workspace settings',async()=>{const db=database(),c=client(db);await c.loadCloudSettings('t');await assert.rejects(c.putCloudSettings('other',settings),/Load the company library/);assert.equal(db.writes,0);});
test('queued saves use newly returned database version',async()=>{const db=database(),c=client(db);await c.loadCloudSettings('t');await Promise.all([c.putCloudSettings('t',{...settings,selection:{brandId:'b'}}),c.putCloudSettings('t',{...settings,selection:{brandId:'next'}})]);assert.equal(db.row.data.selection.brandId,'next');});
