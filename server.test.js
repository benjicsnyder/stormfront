"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {WebSocket}=require("ws");
const {createServer}=require("./server");
const {World,SKINS,profile}=require("./world");
const W=require("./weapons");
const people=n=>Array.from({length:n},(_,i)=>({id:"human-"+i,username:"Player "+i,skin:SKINS[i%SKINS.length].id}));
const land=world=>{world.phase="playing";world.elapsed=20;world.actors.forEach((a,i)=>Object.assign(a,{onBus:false,dropping:false,glider:false,y:0,x:20+i*5,z:20}));};
test("all 40 independent models have five functioning rarity levels",()=>{
  assert.equal(W.guns.length,40);assert.equal(new Set(W.guns.map(g=>g.name)).size,40);
  for(const gun of W.guns){
    const common=W.create(gun.id),rare=W.create(gun.id,4);
    assert.ok(rare.damage>common.damage&&rare.spread<common.spread&&rare.reloadTime<common.reloadTime);
  }
  const world=new World(people(4),"duo");
  assert.equal(world.actors.length,4);assert.equal(world.teams().size,2);
  assert.equal(new Set(world.loot.filter(i=>i.kind==="gun").map(i=>i.weapon.id)).size,40);
  assert.ok(world.actors.every(a=>a.username&&!a.target));
});
test("bus exit, automatic exit, gliding, safe landing and input bounds are authoritative",()=>{
  const w=new World(people(2));const a=w.actors[0];
  w.input(a,{forward:500,strafe:NaN,yaw:Infinity,pitch:99,fire:"true"});
  assert.equal(a.input.forward,1);assert.equal(a.input.strafe,0);assert.equal(a.input.fire,false);assert.equal(a.pitch,1.4);
  w.command(a,"jump");assert.equal(a.onBus,false);assert.equal(a.dropping,true);
  w.command(a,"glider");assert.equal(a.glider,true);
  for(let i=0;i<400;i++)w.update(.05);
  assert.equal(w.phase,"playing");assert.equal(w.actors[1].onBus,false);
  assert.equal(a.y,0);assert.equal(a.glider,false);assert.equal(w.blocked(a.x,a.z),false);
});
test("movement cannot teleport, idle inputs expire, and cover stops shots",()=>{
  const w=new World(people(2));land(w);w.scenery=[];w.loot=[];
  const [a,b]=w.actors;a.x=70;a.z=70;a.yaw=0;b.x=70;b.z=60;b.shield=0;
  w.walls=[{x:70,z:65,y:1.35,w:3.4,d:.22,h:2.7,kind:"wall",hp:180}];
  a.weapons[0].spread=0;
  w.shoot(a);assert.equal(b.hp,100);assert.ok(w.walls[0].hp<180);
  w.walls=[];w.shoot(a);assert.ok(b.hp<100);
  a.input={};w.input(a,{forward:1,x:0,z:0,yaw:0});const z=a.z;w.update(.1);
  assert.ok(a.z<z&&a.z>z-1);
  for(let i=0;i<10;i++)w.update(.1);const stopped=a.z;w.update(.1);assert.equal(a.z,stopped);
});
test("duo friendly fire, card collection and a six-second reboot",()=>{
  const w=new World(people(4),"duo");land(w);w.scenery=[];w.loot=[];
  const [a,b]=w.actors;
  w.hurt(b,1000,a);assert.equal(b.hp,100);
  w.hurt(b,1000,w.actors[2]);assert.equal(b.hp,0);
  a.x=b.x;a.z=b.z;w.update(.05);assert.deepEqual(a.cards,[b.id]);
  a.x=73;a.z=70;
  for(let i=0;i<121;i++){w.input(a,{reboot:true});w.update(.05);}
  assert.equal(b.hp,100);assert.equal(b.shield,0);assert.equal(b.dropping,true);assert.equal(a.cards.length,0);
});
test("reboot progress cancels on movement and cannot revive disconnected players",()=>{
  const w=new World(people(4),"duo");land(w);w.scenery=[];w.loot=[];
  const [a,b]=w.actors;w.hurt(b,1000,w.actors[2]);a.cards=[b.id];a.x=73;a.z=70;
  for(let i=0;i<20;i++){w.input(a,{reboot:true});w.update(.05);}assert.ok(a.reboot>0);
  w.input(a,{reboot:true,forward:1});w.update(.05);assert.equal(a.reboot,0);
  b.connected=false;
  for(let i=0;i<130;i++){w.input(a,{reboot:true});w.update(.05);}assert.equal(b.hp,0);
});
test("weapon accounting, burst shots, building cost and healing are server owned",()=>{
  const w=new World(people(2));land(w);w.scenery=[];w.loot=[];
  const a=w.actors[0];a.weapons[0]=W.create(35);w.input(a,{fire:true});
  for(let i=0;i<5;i++)w.update(.04);
  assert.equal(a.weapons[0].ammo,a.weapons[0].mag-3);
  a.input={};const gun=a.weapons[0];gun.ammo=0;gun.reserve=2;w.reload(a);w.tickWeapon(a,5);
  assert.equal(gun.ammo,2);assert.equal(gun.reserve,0);
  a.yaw=0;w.command(a,"build");assert.equal(a.wood,80);assert.equal(w.walls.length,1);
  w.command(a,"build");assert.equal(a.wood,80);
  a.hp=60;w.command(a,"heal");assert.equal(a.hp,100);assert.equal(a.meds,1);
});
test("team victory, earned coins and finished rounds cannot award twice",()=>{
  const awards=[];const w=new World(people(4),"duo",(id,coins)=>awards.push({id,coins}));land(w);
  w.elapsed=40;const [a,b,c,d]=w.actors;w.hurt(a,1000,c);
  w.hurt(c,1000,b);w.hurt(d,1000,b);w.update(.05);
  assert.equal(w.phase,"finished");assert.equal(awards.length,4);
  assert.equal(awards.find(p=>p.id===b.connection).coins,80);
  assert.equal(awards.find(p=>p.id===a.connection).coins,60);
  w.update(5);assert.equal(awards.length,4);
});
async function fixture(t){
  const app=createServer({secret:"test-only-secret"});await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const port=app.server.address().port,sockets=[];
  t.after(async()=>{sockets.forEach(ws=>ws.terminate());await new Promise(resolve=>app.server.close(resolve));});
  async function connect(username,token){
    const ws=new WebSocket(`ws://127.0.0.1:${port}/socket`);sockets.push(ws);
    const messages=[],waiters=[];
    ws.on("message",raw=>{
      const data=JSON.parse(raw);
      const i=waiters.findIndex(w=>w.predicate(data));
      if(i>=0){const waiter=waiters.splice(i,1)[0];clearTimeout(waiter.timer);waiter.resolve(data);}else messages.push(data);
    });
    const wait=(type,condition=()=>true)=>new Promise((resolve,reject)=>{
      const predicate=m=>m.type===type&&condition(m),i=messages.findIndex(predicate);
      if(i>=0){resolve(messages.splice(i,1)[0]);return;}
      const waiter={predicate,resolve,timer:setTimeout(()=>{const index=waiters.indexOf(waiter);if(index>=0)waiters.splice(index,1);reject(new Error("Timed out waiting for "+type));},4000)};waiters.push(waiter);
    });
    await new Promise((resolve,reject)=>{ws.once("open",resolve);ws.once("error",reject);});
    const send=data=>ws.send(JSON.stringify(data));send({type:"hello",username,token});
    return {ws,wait,send};
  }
  return {...app,connect,port};
}
test("real WebSocket clients create/join a human room, start bus and disconnect",async t=>{
  const f=await fixture(t),a=await f.connect("Human One"),b=await f.connect("Human Two");
  await a.wait("profile");await b.wait("profile");
  a.send({type:"create",mode:"solo"});const room=await a.wait("lobby");
  a.send({type:"start"});assert.match((await a.wait("error")).message,/other human/);
  b.send({type:"join",code:room.code});await a.wait("lobby",m=>m.members.length===2);
  b.send({type:"start"});assert.match((await b.wait("error")).message,/Only the room host/);
  a.send({type:"start"});const snapshot=await a.wait("snapshot");
  assert.equal(snapshot.actors.length,2);assert.equal(snapshot.phase,"bus");
  assert.deepEqual(snapshot.actors.map(p=>p.username),["Human One","Human Two"]);
  a.send({type:"command",name:"jump"});
  const dropped=await a.wait("snapshot",m=>m.actors[0].dropping);assert.equal(dropped.actors[0].onBus,false);
  b.ws.close();const finished=await a.wait("snapshot",m=>m.phase==="finished");assert.equal(finished.actors[1].hp,0);
  const health=await fetch(`http://127.0.0.1:${f.port}/health`).then(r=>r.json());assert.equal(health.ok,true);
  assert.equal((await fetch(`http://127.0.0.1:${f.port}/server.js`)).status,404);
});
test("shop validates balance, skin ownership, signature tampering and token replay",async t=>{
  const f=await fixture(t),a=await f.connect("Shopper");const initial=await a.wait("profile");
  assert.equal(initial.profile.coins,200);
  a.send({type:"equip",skin:"gold"});assert.match((await a.wait("error")).message,/Unlock/);
  a.send({type:"buy",skin:"wave"});const bought=await a.wait("profile");assert.equal(bought.profile.coins,120);assert.equal(bought.profile.skin,"wave");
  a.send({type:"buy",skin:"wave"});const repeat=await a.wait("profile");assert.equal(repeat.profile.coins,120);
  a.send({type:"buy",skin:"night"});assert.match((await a.wait("error")).message,/Not enough/);
  a.send({type:"buy",skin:"fake"});assert.match((await a.wait("error")).message,/Unknown skin/);
  const parts=bought.token.split("."),p=JSON.parse(Buffer.from(parts[0],"base64url"));p.coins=1000000;
  assert.equal(f.verify(Buffer.from(JSON.stringify(p)).toString("base64url")+"."+parts[1]),null);
  await new Promise(resolve=>{a.ws.once("close",resolve);a.ws.close();});
  const b=await f.connect("Shopper",initial.token);const restored=await b.wait("profile");
  assert.equal(restored.profile.coins,120);assert.ok(restored.profile.unlocked.includes("wave"));
});
test("four human duos and username validation",async t=>{
  const f=await fixture(t),bad=await f.connect("<script>");
  assert.match((await bad.wait("error")).message,/2–16/);bad.ws.close();
  const clients=[];
  for(let i=0;i<4;i++){const c=await f.connect("Duo "+i);await c.wait("profile");clients.push(c);}
  const host=clients[0];host.send({type:"create",mode:"duo"});const room=await host.wait("lobby");
  for(let i=1;i<4;i++){clients[i].send({type:"join",code:room.code});await host.wait("lobby",m=>m.members.length===i+1);}
  host.send({type:"start"});const state=await host.wait("snapshot");
  assert.equal(state.actors.length,4);assert.deepEqual(state.actors.map(a=>a.team),[0,0,1,1]);
});
