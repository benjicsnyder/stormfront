"use strict";
const {spawn}=require("node:child_process"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {WebSocket}=require("ws"),{createServer}=require("./server");
const assert=require("node:assert/strict");
(async()=>{
  const app=createServer({secret:"browser-test-only"});
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),"stormfront-browser-"));
  const browser=spawn(process.env.BROWSER_PATH||"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ["--headless","--no-first-run","--use-angle=swiftshader","--enable-unsafe-swiftshader","--remote-debugging-port=0",
      "--window-size=1600,900","--user-data-dir="+profile,"about:blank"],{stdio:["ignore","ignore","pipe"]});
  let socket;
  const timeout=setTimeout(()=>{console.error("Browser test timeout");browser.kill();process.exitCode=1;},60000);
  try{
    const url=await new Promise((resolve,reject)=>{
      let stderr="";browser.stderr.on("data",data=>{stderr+=data;const m=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});
      browser.once("error",reject);browser.once("exit",code=>reject(new Error("Browser exited "+code)));
    });
    socket=new WebSocket(url);await new Promise(resolve=>socket.once("open",resolve));
    let id=0;const pending=new Map(),errors=[];
    socket.on("message",raw=>{
      const data=JSON.parse(raw);
      if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(new Error(JSON.stringify(data.error))):p.resolve(data.result);}}
      if(data.method==="Runtime.exceptionThrown")errors.push(data.params.exceptionDetails.text+" "+(data.params.exceptionDetails.exception?.description||""));
    });
    const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
      const current=++id;pending.set(current,{resolve,reject});socket.send(JSON.stringify({id:current,method,params,sessionId}));
    });
    async function check(route,attribute,origin=base){
      const {targetId}=await call("Target.createTarget",{url:origin.replace(/\/$/,"")+route});
      const {sessionId}=await call("Target.attachToTarget",{targetId,flatten:true});
      await call("Runtime.enable",{},sessionId);await call("Page.enable",{},sessionId);
      let value;
      for(let i=0;i<200;i++){
        await new Promise(resolve=>setTimeout(resolve,100));
        const result=await call("Runtime.evaluate",{expression:`JSON.stringify({status:document.body?.dataset.${attribute},error:document.body?.dataset.error||document.getElementById('test-results')?.textContent,players:document.body?.dataset.humanPlayers})`,returnByValue:true},sessionId);
        value=JSON.parse(result.result.value);
        if(value.status)break;
      }
      assert.equal(value.status,"passed",JSON.stringify(value));assert.deepEqual(errors,[]);
      if(attribute==="onlineTest")assert.equal(value.players,"2");
      if(process.env.BROWSER_SCREENSHOT){
        const image=await call("Page.captureScreenshot",{format:"png"},sessionId);
        fs.writeFileSync(process.env.BROWSER_SCREENSHOT.replace(".png","-"+attribute+".png"),Buffer.from(image.data,"base64"));
      }
      console.log("PASS browser "+route+" "+(value.players?value.players+" human connections":"10 gameplay regressions"));
      await call("Target.closeTarget",{targetId});
    }
    await check("/?test","test",process.env.PUBLIC_GAME_URL||base);
    await check("/?online-test","onlineTest");
  }finally{
    clearTimeout(timeout);if(socket)socket.close();browser.kill();
    for(const c of app.clients.values())c.ws.terminate();
    await new Promise(resolve=>app.server.close(resolve));
    await new Promise(resolve=>{if(browser.exitCode!==null)resolve();else{browser.once("exit",resolve);setTimeout(resolve,3000).unref();}});
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
