import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const label=process.argv[2];
const b=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try {
 const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2,permissions:['camera']});
 await p.goto('http://127.0.0.1:5176/');await p.getByRole('button',{name:'开始体验',exact:true}).click();await p.locator('main.arrived').waitFor();
 await p.getByTestId('lamp-home').getByRole('button',{name:'开始活动',exact:true}).click();
 for(let i=0;i<2;i++){await p.getByRole('button',{name:'下一个活动',exact:true}).click();await p.waitForTimeout(750);}
 await p.getByRole('button',{name:'开始这个活动',exact:true}).click();
 await p.getByTestId('lean-calibration').waitFor();
 await p.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/vision/CameraVision.ts').name;window.__bodyC=(await import(url)).cameraVision;});
 await p.waitForFunction(()=>window.__bodyC.getPoseDiagnostics().poseReady&&window.__bodyC.getPoseDiagnostics().frames>8,null,{timeout:30000});
 const data=await p.evaluate(async()=>{
  const c=window.__bodyC;const entries={face:[],pose:[],raf:[],tasks:[]};
  for(const [name,model] of [['face',c.model],['pose',c.poseModel]]) {if(!model)throw new Error(name+' missing: '+JSON.stringify(c.getPoseDiagnostics()));const original=model.detectForVideo.bind(model);model.detectForVideo=(...args)=>{const start=performance.now();const result=original(...args);entries[name].push(performance.now()-start);return result;};}
  const before=c.getPoseDiagnostics();let last=0,active=true;
  new PerformanceObserver(list=>{if(active)entries.tasks.push(...list.getEntries().map(e=>e.duration));}).observe({type:'longtask'});
  const frame=at=>{if(!active)return;if(last)entries.raf.push(at-last);last=at;requestAnimationFrame(frame);};requestAnimationFrame(frame);
  const start=performance.now();await new Promise(r=>setTimeout(r,12000));active=false;
  return {before,after:c.getPoseDiagnostics(),durationMs:performance.now()-start,...entries};
 });
 const summary={label,mode:'real local MediaPipe on synthetic empty camera video, calibration screen; no body / no human acceptance',...data};
 await writeFile(`docs/performance/g03-v4-camera-${label}.json`,JSON.stringify(summary,null,2));console.log(label,'face calls',data.face.length,'pose calls',data.pose.length,'pose mean',data.pose.reduce((a,b)=>a+b,0)/data.pose.length,'RAF',1000/(data.raf.reduce((a,b)=>a+b,0)/data.raf.length));
} finally{await b.close();}
