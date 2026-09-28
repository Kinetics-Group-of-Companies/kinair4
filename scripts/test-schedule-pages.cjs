const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const vm=require('node:vm'); const ts=require('typescript'); const path=require('node:path');
const root=path.resolve(__dirname,'..');
function load(file, dependencies={}) {const source=fs.readFileSync(path.join(root,file),'utf8'); const out=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}); const context={exports:{},require:name=>dependencies[name]??require(name),File,Uint8Array,Array,Map,WeakMap,console};vm.createContext(context);vm.runInContext(out.outputText,context);return context.exports;}
const combined=load('src/lib/chatScheduleDatasheet.ts',{'./chatDatasheet':{generateDatasheetForSelection:async(_s,_d,_u,_m,o)=>{o.existingDoc.addPage();o.existingDoc.text('FAN TDS',10,10);}},'./airCurtainDatasheet':{generateAirCurtainDatasheet:async o=>{o.existingDoc.addPage();o.existingDoc.text('AIR TDS',10,10);}}});
const selector=load('src/lib/submittal-lite/selector-tds.ts',{'@/lib/chatSelectionSchedule':{selectScheduleFan:()=>null,selectScheduleAirCurtain:()=>null},'@/lib/fanData':{AIRFLOW_UNITS:{CMH:1},PRESSURE_UNITS:{Pa:1}},'@/lib/airCurtainData':{},'@/lib/chatScheduleDatasheet':combined});
test('all unresolved rows stay in a multi-page schedule, without fake TDS',async()=>{
 const items=Array.from({length:90},(_,i)=>({product:'fan',tag:`EF-${i+1}`,quantity:2,existing_selection:'KVF-100P'}));
 const result=await selector.makeAssistantSubmittalTds(items,{database:{},airModels:[],airBrands:[],airSeries:[],airDimensions:[]});
 assert.equal(result.missing.length,90);assert.equal(result.file,undefined);assert.ok(result.scheduleFile);
 const {PDFDocument}=require('pdf-lib');const doc=await PDFDocument.load(await result.scheduleFile.arrayBuffer());assert.ok(doc.getPageCount()>1);
 fs.writeFileSync(path.join(root,'schedule-review-test.pdf'),Buffer.from(await result.scheduleFile.arrayBuffer()));
});
test('mixed fan and air curtain schedules both print before the TDS pages',async()=>{
 const doc=await combined.buildCombinedScheduleDatasheet({title:'Mixed',database:{},rows:[{tag:'FAN-1',quantity:1,selection:{nomenclature:'KVF-100P',operatingPoint:{airflow:100,staticPressure:50},frequency:50,motorPole:2,motorRating:0.1}}],airCurtainRows:[{tag:'AC-1',quantity:1,label:'FM-4518-L',selection:{model:{},units:[],totalAirVolumeCfm:100,totalLengthMm:1800,effectiveThrowM:3,outletVelocity:10,totalPowerW:200,supplyFrequencyHz:50}}]});
 assert.equal(combined.getSchedulePageCount(doc),2);assert.equal(doc.getNumberOfPages(),5);
});

test('schedule remarks omit extraction commentary and retain technical description',()=>{
 assert.equal(combined.cleanScheduleRemarks('Cross Flow Wall mounted Air curtains units (White color); source lists Sliding Door 1 and Sliding Door 1 (dup), each Qty 1; highlighted combined airflow 3494 CFM and length 3000 mm.'),'Cross Flow Wall mounted Air curtains units (White color)');
});
test('air schedule prints units, installed height and total quantity',async()=>{
 const row={tag:'Sliding Door 1',quantity:2,label:'2 x FM-1215N-2(Y)',doorWidthMm:2864,doorHeightM:2.862,specified:{doorWidthMm:2864,doorHeightMm:2862},remarks:'Cross Flow Wall mounted Air curtains units (White color); source lists duplicate rows',selection:{model:{},units:[],totalAirVolumeCfm:3494,totalLengthMm:3000,effectiveThrowM:4.36,outletVelocity:11,totalPowerW:440,supplyFrequencyHz:50}};
 const doc=await combined.buildCombinedScheduleDatasheet({title:'Warehouse in Al Quoz',database:{},rows:[],airCurtainRows:[row],projectDetails:[{label:'Project Name',value:'Warehouse in Al Quoz'}]});
 const text=doc.output();assert.ok(text.includes('Installation Height'));assert.ok(text.includes('2.862'));assert.ok(text.includes('TOTAL QUANTITY'));assert.ok(!text.includes('source lists'));
 fs.writeFileSync(path.join(root,'air-schedule-units-test.pdf'),Buffer.from(doc.output('arraybuffer')));
});

test('brand palette ignores backgrounds, follows logo ink and keeps text readable',()=>{
 const blue=combined.schedulePalette([255,255,255,255,0,0,0,0,0,0,0,255,10,100,230,255,10,100,230,255]);
 assert.equal(JSON.stringify(blue.primary),'[10,100,230]');
 assert.equal(JSON.stringify(blue.ink),'[255,255,255]');
 const yellow=combined.schedulePalette([250,220,10,255]);
 assert.equal(JSON.stringify(yellow.ink),'[0,0,0]');
 const red=combined.schedulePalette([210,20,30,255]);
 assert.equal(JSON.stringify(red.primary),'[210,20,30]');
 assert.equal(JSON.stringify(combined.schedulePalette([]).primary),'[16,106,237]');
});

 test('OCR digit repair is restricted to an existing size in the supplied family',()=>{
 const context={database:{series:[{id:'p',name:'KVF-P'}],fans:[{diameter:100,seriesId:'p',series:'KVF-P'}]}};
 assert.equal(selector.canonicalFanSelection('KVF-IOOP',context),'KVF-100P');
 assert.equal(selector.canonicalFanSelection('KVF-100P',context),'KVF-100P');
 assert.equal(selector.canonicalFanSelection('KVF-IOOM',context),'KVF-IOOM');
 assert.equal(selector.canonicalFanSelection('KVF-2OOP',context),'KVF-2OOP');
 assert.equal(selector.canonicalFanSelection('KVF-150P',context),'KVF-150P');
 });

test('proposed fan duty uses specified units with real conversion',()=>{
 assert.equal(combined.proposedDutyCell(90,'LPS','airflow'),'25 L/s');
 assert.equal(combined.proposedDutyCell(169.90107955,'CFM','airflow'),'100 CFM');
 assert.equal(combined.proposedDutyCell(3600,'CMS','airflow'),'1 m³/s');
 assert.equal(combined.proposedDutyCell(98.0665,'mmwg','pressure'),'10 mmwg');
 assert.equal(combined.proposedDutyCell(249.08891,'inwg','pressure'),'1 inwg');
 assert.equal(combined.proposedDutyCell(100,'Pa','pressure'),'100 Pa');
});

test('electrical cells omit unit labels while preserving ratings',()=>{
 assert.equal(combined.electricalRating('230 V / 1 Ph / 50 Hz'),'230/1/50');
 assert.equal(combined.electricalRating('400V/3PH/60HZ'),'400/3/60');
 assert.equal(combined.electricalRating('220-240V/1/50Hz'),'220-240/1/50');
 assert.equal(combined.electricalRating('230/1/50'),'230/1/50');
});

test('electrical formatting removes stray slashes and never appends frequency twice',()=>{
 assert.equal(combined.electricalRating('230/1/50 / V/Ph/Hz'),'230/1/50');
 assert.equal(combined.electricalRating('230V//1Ph//50Hz//'),'230/1/50');
 assert.equal(combined.airElectricalRating('230/1/50',50),'230/1/50');
 assert.equal(combined.airElectricalRating('220-240V/50Hz',50),'220-240/—/50');
 assert.equal(combined.airElectricalRating('400V/3Ph',60),'400/3/60');
});

test('confirmed air curtain models retain single phase without guessing for other equipment',()=>{
 for(const model of ['FM-4518-L/(Y)','FM-4512-L/(Y)','FM-4520XD(B)-L/(Y)','FM-1215N-2(Y)','FM-1220N-2(Y)']) assert.equal(combined.airElectricalRating('220-240V',50,model),'220-240/1/50');
 assert.equal(combined.airElectricalRating('400V/3Ph',50,'FM-4518-L/(Y)'),'400/3/50');
 assert.equal(combined.airElectricalRating('230V',50,'UNKNOWN'),'230/—/50');
});
test('eight air curtain rows and quantity total fit one schedule page with compact stamp clearance',async()=>{
 const rows=Array.from({length:8},(_,i)=>({tag:`Door-${i+1}`,quantity:i===6?2:1,label:'FM-4518-L/(Y)',doorWidthMm:1700,doorHeightM:2.235,specified:{doorWidthMm:1700,doorHeightMm:2235},remarks:'Centrifugal Flow Wall mounted Air curtains units (White color)',accessories:'Magnetic Sensor',selection:{model:{model:'FM-4518-L/(Y)'},units:[],voltage:'220-240V',totalAirVolumeCfm:1482,totalLengthMm:1800,outletVelocity:18,totalPowerW:750,supplyFrequencyHz:50}}));
 const doc=await combined.buildCombinedScheduleDatasheet({title:'Warehouse in Al Quoz',database:{},rows:[],airCurtainRows:rows,projectDetails:['Project Name','Client','MEP Consultant','Main Contractor','MEP Contractor','Date'].map(label=>({label,value:'Warehouse in Al Quoz / M/S XYZ Construction L.L.C.'}))});
 assert.equal(combined.getSchedulePageCount(doc),1);assert.ok(doc.output().includes('220-240/1/50'));assert.ok(doc.output().includes('TOTAL QUANTITY'));
 fs.writeFileSync(path.join(root,'compact-air-schedule-test.pdf'),Buffer.from(doc.output('arraybuffer')));
});

test('supplied proposed cells preserve printed values and blanks instead of selector defaults',()=>{
 assert.equal(combined.proposedCell({airflow:'125 L/s'},'airflow','999 CMH'),'125 L/s');
 assert.equal(combined.proposedCell({motor_rpm:'1450'},'fan_rpm','1500'),'');
 assert.equal(combined.proposedCell(undefined,'airflow','999 CMH'),'999 CMH');
});
test('schedule separates motor and fan RPM and never prints synchronous speed as fan speed',async()=>{
 const row={tag:'F-1',quantity:1,specified:{motorRpm:1450},sourceProposed:{model:'SOURCE-MODEL',airflow:'123 L/s',esp:'82 Pa',motor_rpm:'1440',fan_rpm:'980',power:'0.73 kW',electrical:'400/3/50'},selection:{nomenclature:'OTHER-MODEL',operatingPoint:{airflow:999,staticPressure:999},frequency:50,motorPole:2,motorRating:.9}};
 const doc=await combined.buildCombinedScheduleDatasheet({title:'Source preservation',database:{},rows:[row],scheduleOnly:true});
 const text=doc.output();assert.ok(text.includes('SOURCE-MODEL'));assert.ok(text.includes('123 L/s'));assert.ok(text.includes('0.73 kW'));assert.ok(text.includes('1440'));assert.ok(text.includes('980'));assert.ok(text.includes('1450'));assert.ok(!text.includes('(3000)'));
});
