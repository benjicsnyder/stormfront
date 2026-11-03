"use strict";
(() => {
  const $ = id => document.getElementById(id), canvas = $("game");
  const testMode = location.search === "?test" || location.search === "?online-test";
  const W = StormWeapons, WORLD = 140, CENTER = 70, TAU = Math.PI * 2;
  const keys = new Set(), input = { fire: false, aim: false };
  const rand = (a,b) => a + Math.random()*(b-a);
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const dist = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
  let renderer, state = "menu", mode = "solo", actors = [], scenery = [], walls = [], loot = [], traces = [];
  let player, teammate, elapsed = 0, last = 0, kills = 0, noticeTime = 0, buildCooldown = 0, kick = 0;
  const storm = { x: CENTER, z: CENTER, radius: 100 };
  let nearby = null;
  const net=window.StormOnline;
  let online=false,latest=null,inputClock=0,bus=null,mapOpen=false,onlineFinished=false;
  const mapCtx=$("map").getContext("2d"),nameLabels=new Map();
  const alive = () => actors.filter(a => a.hp > 0);
  const teams = () => new Set(alive().map(a => a.team));
  const friendly = a => a.team === player.team;
  const followed = () => player.hp > 0 ? player : teammate && teammate.hp > 0 ? teammate : player;
  function message(text) { $("notice").textContent = text; noticeTime = 3; }
  function fail(error) {
    state = "error"; $("error").hidden = false; $("errorText").textContent = error.message;
    if (testMode) { document.body.dataset.test = "failed"; document.body.dataset.error = error.message; }
  }
  try { renderer = new StormRenderer(canvas); } catch (error) { fail(error); return; }
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); fail(new Error("The 3D graphics context was lost. Reload the page to restart.")); });
  function box(x,z,w,d,h,kind) { return { x,z,w,d,h,y:h/2,kind,hp:kind === "wall" ? 180 : 280 }; }
  function collide(x,z,r,o) {
    return Math.hypot(x-clamp(x,o.x-o.w/2,o.x+o.w/2),z-clamp(z,o.z-o.d/2,o.z+o.d/2)) < r;
  }
  function blocked(x,z,r=.38) {
    return x < r || z < r || x > WORLD-r || z > WORLD-r || [...scenery,...walls].some(o => collide(x,z,r,o));
  }
  function spawn(minDistance=4) {
    for (let i=0;i<1500;i++) {
      const p={x:rand(6,134),z:rand(6,134)};
      if (!blocked(p.x,p.z,1.1) && actors.every(a => dist(a,p)>minDistance)) return p;
    }
    for (let z=2;z<138;z+=2) for (let x=2;x<138;x+=2) {
      if (!blocked(x,z,1.1) && actors.every(a => dist(a,{x,z})>1)) return {x,z};
    }
    throw new Error("No safe spawn location available.");
  }
  function actor(x,z,id,team,human=false) {
    const skins = ["#edb58d","#c88e67","#8f5d42","#e4a783"];
    const colors = ["#e47866","#b388dc","#e5b856","#738ecc","#c978a3"];
    return {x,z,y:0,vy:0,id,team,human,hp:100,shield:human?50:25,yaw:0,pitch:0,
      slot:0,weapons:[W.create(human?0:Math.floor(rand(0,40)),human?1:W.roll()),W.create(20,0)],
      wood:100,meds:2,think:0,target:null,wander:rand(0,TAU),stuck:0,moving:false,
      skin:skins[id%skins.length],color:colors[id%colors.length],reaction:rand(.15,.55)};
  }
  function initialize(selected=$("mode").value) {
    mode=selected.includes("duo")?"duo":"solo"; actors=[]; scenery=[]; walls=[]; loot=[]; traces=[]; teammate=null;
    elapsed=0;kills=0;buildCooldown=0;kick=0;storm.radius=100;nearby=null;bus=null;
    for(let i=0;i<65;i++) {
      const x=rand(5,135),z=rand(5,135);
      if(Math.hypot(x-CENTER,z-CENTER)<8) continue;
      const kind=i%4===0?"hut":i%3===0?"rock":"tree";
      const o=box(x,z,kind==="hut"?4:kind==="tree"?1.2:2.8,kind==="hut"?4:kind==="tree"?1.2:2.8,kind==="hut"?3.5:kind==="tree"?5:1.4,kind);
      if(!scenery.some(b=>Math.abs(b.x-x)<(b.w+o.w)/2+1 && Math.abs(b.z-z)<(b.d+o.d)/2+1))scenery.push(o);
    }
    player=actor(CENTER,CENTER,0,0,true);actors.push(player);
    if(mode==="duo"){teammate=actor(CENTER+2,CENTER+2,1,0);actors.push(teammate);}
    while(actors.length<24){
      const id=actors.length,team=mode==="duo"?Math.floor(id/2):id;
      const partner=mode==="duo"&&id%2===1?actors[id-1]:null;
      let p=spawn(5);
      if(partner) {
        for(let i=0;i<30;i++){
          const q={x:partner.x+rand(-3,3),z:partner.z+rand(-3,3)};
          if(!blocked(q.x,q.z,.6)&&dist(q,partner)>1){p=q;break;}
        }
      }
      actors.push(actor(p.x,p.z,id,team));
    }
    // All 40 distinct models appear on the island every match.
    for(const gun of W.guns){const p=spawn(0);loot.push({...p,kind:"gun",weapon:W.create(gun.id,W.roll())});}
    loot.push({x:70,z:65,kind:"gun",weapon:W.create(12,2)},{x:73,z:67,kind:"gun",weapon:W.create(16,3)});
    for(let i=0;i<65;i++){const p=spawn(0);loot.push({...p,kind:["ammo","wood","shield","medkit"][i%4]});}
    keys.clear();input.fire=false;input.aim=false;updateHud();
  }
  function lockMouse(){
    if(testMode)return;
    try {
      const request=canvas.requestPointerLock();
      if(request && request.catch)request.catch(()=>message("CLICK THE ARENA TO ENABLE MOUSE LOOK"));
    }catch(_){message("CLICK AND DRAG TO LOOK; CLICK TO FIRE");}
  }
  function start(){
    if($("mode").value.startsWith("online")){net.create();return;}
    online=false;bus=null;onlineFinished=false;$("nameplates").replaceChildren();nameLabels.clear();
    initialize();boardBus();state="playing";$("menu").hidden=true;$("result").hidden=true;$("pause").hidden=true;$("hud").hidden=false;
    message("YOU'RE IN THE FLYING BATTLE BUS — SPACE TO JUMP, G TO OPEN YOUR GLIDER");
    lockMouse();
  }
  function boardBus(){
    bus={x:10,y:33,z:70,active:true};
    for(const a of actors){
      a.landing={x:a.x,z:a.z};
      Object.assign(a,{x:bus.x+(a.id%6-2.5)*.9,z:bus.z+(Math.floor(a.id/6)-1.5)*.9,
        y:31.75,vy:0,yaw:Math.PI/2,pitch:0,onBus:true,dropping:false,glider:false,dropAt:rand(3,15)});
    }
    updateHud();
  }
  function jumpFromBus(a){
    if(!a.onBus)return;
    a.onBus=false;a.dropping=true;a.glider=false;a.vy=0;
    a.z=bus.z+(a.id%2===0?-3.2:3.2);
    if(a.human)message("WASD TO STEER — G TO DEPLOY YOUR GLIDER");
  }
  function descend(a,dt){
    if(a.dropping&&a.y<16)a.glider=true;
    a.vy=a.glider?-3.8:a.vy-18*dt;a.y=Math.max(0,a.y+a.vy*dt);
    if(a.y>0)return;
    a.vy=0;
    if(a.dropping&&blocked(a.x,a.z)){
      let found=false;
      for(let radius=.5;radius<8&&!found;radius+=.5)for(let angle=0;angle<TAU;angle+=Math.PI/8){
        const x=a.x+Math.sin(angle)*radius,z=a.z+Math.cos(angle)*radius;
        if(!blocked(x,z)){a.x=x;a.z=z;found=true;break;}
      }
    }
    const wasDropping=a.dropping;a.dropping=false;a.glider=false;
    if(wasDropping&&a.human)message("LANDED — FIND LOOT AND SURVIVE!");
  }
  function pause(value){
    if(!["playing","paused"].includes(state))return;
    state=value?"paused":"playing";$("pause").hidden=!value;keys.clear();input.fire=false;input.aim=false;
    if(online&&value)net.send({type:"input",yaw:player.yaw,pitch:player.pitch});
    if(value){if(document.pointerLockElement)document.exitPointerLock();}else lockMouse();
  }
  function reload(a){
    const w=a.weapons[a.slot];
    if(!w.reloadLeft&&w.ammo<w.mag&&w.reserve>0){
      w.reloadLeft=w.reloadTime;w.burstLeft=0;if(a.human)message("RELOADING "+w.name.toUpperCase());
    }
  }
  function swap(slot){
    if(player.hp<=0||player.slot===slot)return;
    player.weapons[player.slot].burstLeft=0;player.slot=slot;kick=0;
    message(player.weapons[slot].name.toUpperCase());updateHud();
  }
  function heal(a=player){
    if(a.hp<=0)return;
    if(!a.meds){if(a.human)message("NO MEDKITS");return;}
    if(a.hp>=100){if(a.human)message("HEALTH IS FULL");return;}
    a.meds--;a.hp=Math.min(100,a.hp+50);if(a.human)message("+50 HEALTH");
  }
  function hurt(a,damage,attacker){
    if(a.hp<=0||a.onBus||attacker&&a.team===attacker.team)return;
    const absorbed=Math.min(a.shield,damage);a.shield-=absorbed;a.hp=Math.max(0,a.hp-damage+absorbed);
    if(a.hp===0){
      loot.push({x:a.x,z:a.z,kind:"gun",weapon:a.weapons[a.slot]},{x:a.x+.6,z:a.z,kind:"ammo"});
      if(attacker===player){kills++;message("ELIMINATED FIGHTER "+(a.id+1));}
      else if(attacker===teammate)message("YOUR TEAMMATE ELIMINATED A FIGHTER");
      if(a===player&&teammate&&teammate.hp>0){input.fire=false;input.aim=false;keys.clear();message("YOU'RE OUT — SPECTATING YOUR TEAMMATE");}
    }
  }
  // Slab intersections select the closest solid surface along each 3D shot.
  function rayBox(origin,dir,o){
    let near=0,far=Infinity;
    const sizes=[o.w,o.h,o.d],centers=[o.x,o.y,o.z];
    for(let i=0;i<3;i++){
      const lo=centers[i]-sizes[i]/2,hi=centers[i]+sizes[i]/2;
      if(Math.abs(dir[i])<1e-8){if(origin[i]<lo||origin[i]>hi)return Infinity;}
      else{
        let a=(lo-origin[i])/dir[i],b=(hi-origin[i])/dir[i];
        if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);
        if(near>far)return Infinity;
      }
    }
    return near;
  }
  function shootRay(a,dir,damage,range){
    const origin=[a.x,a.y+1.55,a.z];let nearest=range,hit=null;
    for(const o of [...scenery,...walls]){
      const t=rayBox(origin,dir,o);if(t<nearest){nearest=t;hit={o};}
    }
    for(const target of actors){
      if(target===a||target.hp<=0||target.onBus)continue;
      const t=rayBox(origin,dir,{x:target.x,y:target.y+.95,z:target.z,w:.62,h:1.9,d:.62});
      if(t<nearest){nearest=t;hit={target};}
    }
    const end=origin.map((n,i)=>n+dir[i]*nearest);
    traces.push({from:origin,to:end,life:.09,color:a.human?"#ffe49a":friendly(a)?"#74f0ff":"#ffae81"});
    if(hit&&hit.o){
      hit.o.hp-=damage;
      if(hit.o.hp<=0){
        scenery=scenery.filter(o=>o!==hit.o);walls=walls.filter(o=>o!==hit.o);loot.push({x:hit.o.x,z:hit.o.z,kind:"wood"});
      }
    }
    if(hit&&hit.target){
      const head=end[1]>hit.target.y+1.48;
      hurt(hit.target,damage*(head?1.5:1),a);
      if(a.human&&hit.target.team!==a.team){$("crosshair").classList.add("hit");kick=Math.max(kick,.5);}
    }
    return hit;
  }
  function discharge(a){
    const w=a.weapons[a.slot];if(w.ammo<=0||w.reloadLeft>0||a.onBus||a.dropping)return;
    w.ammo--;
    const aimed=a.human?input.aim:true;
    for(let i=0;i<w.pellets;i++){
      const spread=w.spread*(aimed?.45:1)+(a.human?0:.025);
      const yaw=a.yaw+rand(-spread,spread),pitch=a.pitch+rand(-spread,spread);
      const dir=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
      shootRay(a,dir,w.damage,w.range);
    }
    if(a.human)kick=1;
  }
  function fire(a){
    if(a.onBus||a.dropping)return;
    const w=a.weapons[a.slot];
    if(w.cooldown>0||w.reloadLeft>0||w.burstLeft>0)return;
    if(!w.ammo){reload(a);return;}
    discharge(a);w.cooldown=w.rate*(a.human?1:1.35);
    if(w.burst>1){w.burstLeft=Math.min(w.burst-1,w.ammo);w.burstTime=.07;}
  }
  function tickWeapons(a,dt){
    for(let i=0;i<a.weapons.length;i++){
      const w=a.weapons[i];w.cooldown=Math.max(0,w.cooldown-dt);
      if(w.reloadLeft>0){
        w.reloadLeft=Math.max(0,w.reloadLeft-dt);
        if(w.reloadLeft===0){const n=Math.min(w.mag-w.ammo,w.reserve);w.ammo+=n;w.reserve-=n;}
      }
      if(i===a.slot&&w.burstLeft>0){
        w.burstTime-=dt;
        if(w.burstTime<=0){discharge(a);w.burstLeft--;w.burstTime=.07;}
      }
    }
  }
  function move(a,dx,dz,dt,speed){
    const n=Math.hypot(dx,dz);a.moving=n>0;
    if(!n)return;
    const x=clamp(a.x+dx/n*speed*dt,.4,139.6),z=clamp(a.z+dz/n*speed*dt,.4,139.6);
    if(a.dropping||!blocked(x,a.z))a.x=x;if(a.dropping||!blocked(a.x,z))a.z=z;
  }
  function build(){
    if(player.hp<=0||player.onBus||player.dropping||buildCooldown>0)return;
    if(player.wood<20){message("NEED 20 WOOD");return;}
    const sideways=Math.abs(Math.sin(player.yaw))>Math.abs(Math.cos(player.yaw));
    const o=box(player.x+Math.sin(player.yaw)*2.5,player.z-Math.cos(player.yaw)*2.5,sideways?.22:3.4,sideways?3.4:.22,2.7,"wall");
    const overlap=b=>Math.abs(b.x-o.x)<(b.w+o.w)/2&&Math.abs(b.z-o.z)<(b.d+o.d)/2;
    if(o.x-o.w/2<0||o.z-o.d/2<0||o.x+o.w/2>WORLD||o.z+o.d/2>WORLD||
      [...scenery,...walls].some(overlap)||alive().some(a=>collide(a.x,a.z,.5,o))){message("CAN'T BUILD HERE");return;}
    walls.push(o);player.wood-=20;buildCooldown=.4;message("COVER BUILT");
  }
  function pickupGun(a,item){
    const old=a.weapons[a.slot];old.burstLeft=0;old.reloadLeft=0;
    a.weapons[a.slot]=item.weapon;item.weapon=old;item.x=a.x+1;item.z=a.z+1;
    if(a.human){message(W.rarities[a.weapons[a.slot].rarity].name.toUpperCase()+" "+a.weapons[a.slot].name.toUpperCase());nearby=null;}
  }
  function collect(a,item){
    if(item.kind==="gun")return false;
    if(item.kind==="shield"&&a.shield>=100||item.kind==="medkit"&&a.meds>=5)return false;
    if(item.kind==="ammo")a.weapons.forEach(w=>w.reserve+=w.mag*2);
    if(item.kind==="wood")a.wood+=40;
    if(item.kind==="shield")a.shield=Math.min(100,a.shield+35);
    if(item.kind==="medkit")a.meds++;
    if(a.human)message({ammo:"AMMO COLLECTED",wood:"+40 WOOD",shield:"+35 SHIELD",medkit:"+1 MEDKIT"}[item.kind]);
    return true;
  }
  function bot(a,dt){
    a.think-=dt;a.reaction=Math.max(0,a.reaction-dt);
    const outside=dist(a,storm)>storm.radius-5;
    if(a.think<=0){
      a.think=rand(.25,.6);a.wander+=rand(-.9,.9);
      a.target=alive().filter(b=>b.team!==a.team&&dist(a,b)<60).sort((b,c)=>dist(a,b)-dist(a,c))[0];
    }
    let dx=Math.sin(a.wander),dz=-Math.cos(a.wander);
    const partner=mode==="duo"?actors.find(b=>b!==a&&b.team===a.team&&b.hp>0):null;
    if(a.target&&a.target.hp>0){
      const t=a.target,d=dist(a,t);a.yaw=Math.atan2(t.x-a.x,a.z-t.z);
      a.pitch=Math.atan2(t.y+.95-(a.y+1.55),d);
      const desired=Math.min(a.weapons[a.slot].range*.6,20),approach=d>desired?1:d<desired*.5?-1:0;
      dx=(t.x-a.x)*approach+Math.cos(a.yaw)*2;dz=(t.z-a.z)*approach+Math.sin(a.yaw)*2;
      if(d<a.weapons[a.slot].range&&a.reaction<=0)fire(a);
    }else{
      a.pitch=0;
      if(partner&&dist(a,partner)>5){dx=partner.x-a.x;dz=partner.z-a.z;}
      a.yaw=Math.atan2(dx,-dz);
    }
    if(outside){dx=CENTER-a.x;dz=CENTER-a.z;}
    const ox=a.x,oz=a.z;move(a,dx,dz,dt,outside?7:4);
    if(Math.hypot(a.x-ox,a.z-oz)<.005){
      a.stuck+=dt;a.wander+=dt*3;move(a,Math.sin(a.wander),-Math.cos(a.wander),dt,4);
      if(a.stuck>1){
        const o=[...scenery,...walls].find(b=>dist(a,b)<5);
        if(o){a.yaw=Math.atan2(o.x-a.x,a.z-o.z);a.pitch=0;fire(a);}
      }
    }else a.stuck=0;
    if(a.hp<50&&a.meds)heal(a);
    if(!a.weapons[a.slot].ammo)reload(a);
  }
  function update(dt){
    elapsed+=dt;storm.radius=Math.max(0,100-Math.max(0,elapsed-(bus?38:20))*.38);
    if(bus){bus.x=10+Math.min(1,elapsed/18)*120;bus.active=elapsed<18;}
    buildCooldown=Math.max(0,buildCooldown-dt);kick=Math.max(0,kick-dt*7);
    if(kick===0)$("crosshair").classList.remove("hit");
    noticeTime-=dt;if(noticeTime<=0)$("notice").textContent="";
    nearby=null;
    for(const a of actors){
      if(a.hp<=0)continue;
      if(a.onBus){
        a.x=bus.x+(a.id%6-2.5)*.9;a.z=bus.z+(Math.floor(a.id/6)-1.5)*.9;a.moving=false;
        if(!bus.active||!a.human&&(a===teammate?!player.onBus:elapsed>=a.dropAt))jumpFromBus(a);
        else continue;
      }
      tickWeapons(a,dt);
      if(a.human){
        const forward=Number(keys.has("KeyW")||keys.has("ArrowUp"))-Number(keys.has("KeyS")||keys.has("ArrowDown"));
        const strafe=Number(keys.has("KeyD")||keys.has("ArrowRight"))-Number(keys.has("KeyA")||keys.has("ArrowLeft"));
        move(a,Math.sin(a.yaw)*forward+Math.cos(a.yaw)*strafe,-Math.cos(a.yaw)*forward+Math.sin(a.yaw)*strafe,dt,
          a.dropping?(a.glider?11:8):input.aim?3.2:keys.has("ShiftLeft")||keys.has("ShiftRight")?9:6);
        if(input.fire)fire(a);
      }else if(a.dropping){
        const target=a===teammate?player:a.landing;
        const dx=target.x-a.x,dz=target.z-a.z;
        a.yaw=Math.atan2(dx,-dz);
        if(Math.hypot(dx,dz)>1)move(a,dx,dz,dt,a.glider?11:8);else a.moving=false;
      }else bot(a,dt);
      descend(a,dt);
      if(dist(a,storm)>storm.radius)hurt(a,dt*(elapsed>200?18:7),null);
      if(a.y>1)continue;
      for(let i=loot.length-1;i>=0;i--){
        const item=loot[i],d=dist(a,item);
        if(item.kind==="gun"){
          if(a.human&&d<2.7&&(!nearby||d<dist(a,nearby)))nearby=item;
        }else if(d<1.2&&collect(a,item))loot.splice(i,1);
      }
    }
    traces.forEach(t=>t.life-=dt);traces=traces.filter(t=>t.life>0);
    updateHud();
    if(!alive().some(friendly)||teams().size===1)finish();
  }
  function finish(){
    state="finished";input.fire=false;input.aim=false;if(document.pointerLockElement)document.exitPointerLock();
    const won=alive().some(friendly);
    $("result").hidden=false;$("resultLabel").textContent=won?"#1 "+(mode==="duo"?"DUO TEAM":"LAST ONE STANDING"):"PLACED #"+(teams().size+1);
    $("resultTitle").textContent=won?"VICTORY!":"OUTLASTED";
    $("resultStats").textContent=`${kills} eliminations · ${Math.floor(elapsed/60)}m ${Math.floor(elapsed%60)}s · ${mode==="duo"?"Duos":"Solo"}`;
  }
  function updateHud(){
    const watch=followed(),w=watch.weapons[watch.slot],tier=W.rarities[w.rarity];
    $("alive").textContent=mode==="duo"?`${teams().size} TEAMS · ${alive().length} ALIVE`:`${alive().length} ALIVE`;
    $("kills").textContent=`${kills} ELIMINATIONS`;
    const stormDelay=bus?38:20;
    $("storm").textContent=watch.onBus?`BUS DEPARTS IN ${Math.max(0,Math.ceil(18-elapsed))}s`:elapsed<stormDelay?`STORM IN ${Math.ceil(stormDelay-elapsed)}s`:"STORM CLOSING";
    $("health").style.width=`${watch.hp}%`;$("shield").style.width=`${watch.shield}%`;
    $("healthText").textContent=Math.ceil(watch.hp);$("shieldText").textContent=Math.ceil(watch.shield);
    $("gunName").textContent=w.name;$("rarity").textContent=tier.name.toUpperCase();
    $("weaponSlot").style.borderColor=tier.color;$("rarity").style.color=tier.color;
    $("ammo").textContent=w.reloadLeft>0?"RELOADING...":`${w.ammo} / ${w.reserve}`;
    $("secondary").textContent=`${watch.slot===0?2:1}: ${watch.weapons[1-watch.slot].name}`;
    $("wood").textContent=`${watch.wood} WOOD`;$("meds").textContent=`${watch.meds} LEFT`;
    const bearing=((watch.yaw*180/Math.PI)%360+360)%360;
    $("compass").textContent=`${["N","NE","E","SE","S","SW","W","NW"][Math.round(bearing/45)%8]}  ${Math.round(bearing)}°`;
    $("crosshair").hidden=player.hp<=0;
    let teamText=mode==="duo"?`${online?teammate?.username||"TEAMMATE":"CYAN = TEAMMATE"} · ${teammate?.hp>0?Math.ceil(teammate.hp)+" HP · "+Math.round(dist(player,teammate))+"m away":"ELIMINATED"}`:"SOLO · NO ALLIES";
    if(player.hp<=0&&teammate&&teammate.hp>0)teamText=`SPECTATING ${online?teammate.username:"YOUR TEAMMATE"} · TEAM STILL IN THE FIGHT`;
    $("teamStatus").textContent=teamText;
    if(nearby&&player.hp>0){
      const rarity=W.rarities[nearby.weapon.rarity];$("pickup").textContent=`E — ${rarity.name.toUpperCase()} ${nearby.weapon.name} · replaces slot ${player.slot+1}`;
      $("pickup").style.color=rarity.color;
    }else $("pickup").textContent=dist(watch,storm)>storm.radius?"IN THE STORM — RUN TOWARD THE ISLAND CENTER":"";
    if(watch.onBus)$("pickup").textContent="YOU'RE IN THE FLYING BUS — SPACE TO JUMP";
    else if(watch.dropping)$("pickup").textContent=watch.glider?"GLIDER OPEN · WASD STEER · G TO TOGGLE":"FALLING · G TO DEPLOY GLIDER";
    else if(online){
      if(player.cards?.length&&latest?.vans.some(v=>dist(player,v)<4.5))$("pickup").textContent=`HOLD H TO REBOOT TEAMMATE · ${Math.floor((player.reboot||0)/6*100)}%`;
      else if(player.cards?.length)$("pickup").textContent="REBOOT CARD COLLECTED — FIND A CYAN VAN ON THE MAP";
    }
  }
  function render(){
    const watch=state==="menu"?player:followed(),eye=[watch.x,watch.y+1.6,watch.z];
    const yaw=state==="menu"?elapsed*.04+.5:watch.yaw,pitch=state==="menu"?-.12:watch.pitch;
    const aiming=input.aim&&player.hp>0&&!watch.onBus&&!watch.dropping;
    const fov=aiming?(watch.weapons[watch.slot].shape==="sniper"?.48:.85):1.3;
    renderer.begin(eye,yaw,pitch,fov,storm.radius);
    renderer.box(70,-.2,70,140,.4,140,"#579265");
    renderer.box(70,.005,48,140,.015,5,"#b6a782");renderer.box(44,.005,70,5,.015,140,"#b6a782");
    for(const o of scenery){
      if(o.kind==="tree"){
        renderer.box(o.x,2.3,o.z,1.2,4.6,1.2,"#8c6447");
        renderer.box(o.x,4.3,o.z,4,2.3,4,"#33714b");
        renderer.box(o.x,5.6,o.z,2.7,1.5,2.7,"#438757",.25);
      }else if(o.kind==="van"){
        renderer.box(o.x,1.4,o.z,2.6,2.3,4.5,"#dce7ef");
        renderer.box(o.x,1.5,o.z-1.8,2.4,1.7,.8,"#61a7c8");
        renderer.box(o.x,2.75,o.z,.6,.22,.6,"#60efff",elapsed,true);
        for(const side of [-1,1])for(const end of [-1.4,1.4])renderer.box(o.x+side*1.25,.45,o.z+end,.25,.7,.7,"#233647");
        renderer.box(o.x,3.35,o.z,.15,.55,.15,"#65efff",elapsed,true);
      }else if(o.kind==="hut"){
        renderer.box(o.x,1.75,o.z,o.w,3.5,o.d,"#bd9b79");
        renderer.box(o.x,3.6,o.z,4.5,.35,4.5,"#5b7591");
        renderer.box(o.x,.95,o.z-o.d/2-.015,.85,1.9,.025,"#654a40");
        renderer.box(o.x-1.2,2,o.z-o.d/2-.02,.7,.7,.025,"#91c8de");
      }else renderer.box(o.x,o.y,o.z,o.w,o.h,o.d,"#8c9ca2",.0);
    }
    for(const o of walls){
      renderer.box(o.x,o.y,o.z,o.w,o.h,o.d,"#ba884e");
      const horizontal=o.w>o.d;
      for(let i=-1;i<=1;i++)renderer.box(o.x+(horizontal?i:0),o.y,o.z+(horizontal?0:i),horizontal?.08:o.w+.03,o.h+.05,horizontal?o.d+.03:.08,"#e3bd78");
    }
    const colors={ammo:"#ffe18b",wood:"#e6b378",shield:"#65d8ff",medkit:"#b6ff59"};
    for(const item of loot){
      if(dist(watch,item)>65)continue;
      if(item.kind==="gun"){
        const color=W.rarities[item.weapon.rarity].color;
        renderer.box(item.x,.04,item.z,.9,.05,.9,color,0,true);
        renderer.box(item.x,.8,item.z,.07,1.5,.07,color,0,true);
        renderer.gun(item.x,.38+Math.sin(elapsed*2+item.x)*.06,item.z,elapsed*.5,item.weapon);
      }else if(item.kind==="card"){
        if(item.team===player.team)renderer.box(item.x,.4,item.z,.3,.5,.08,"#65efff",elapsed,true);
      }else{
        renderer.box(item.x,.25+Math.sin(elapsed*3+item.x)*.06,item.z,.35,.35,.35,colors[item.kind],elapsed*.5,true);
        if(item.kind==="medkit")renderer.box(item.x,.44,item.z,.2,.04,.06,"#ffffff");
      }
    }
    for(const a of actors)if(a.hp>0&&a!==watch&&(!a.onBus||watch.onBus)){
      renderer.person(a,elapsed,friendly(a)&&a!==player);
      if(a.glider){
        renderer.box(a.x,a.y+3,a.z,3.5,.15,2.3,friendly(a)?"#65d8ff":"#e5b856",-a.yaw);
        for(const side of [-1,1])renderer.box(a.x+side*.55,a.y+2.3,a.z,.03,1.4,.03,"#eaf0ee");
      }
    }
    if(bus?.active){
      renderer.box(bus.x,bus.y-1.4,bus.z,9,.25,3.5,"#405467");
      renderer.box(bus.x,bus.y+1.6,bus.z,9,.2,3.7,"#e3cf81");
      for(const side of [-1,1]){
        renderer.box(bus.x,bus.y-.65,bus.z+side*1.8,9,1.4,.12,"#3e82c8");
        renderer.box(bus.x,bus.y+.3,bus.z+side*1.8,9,.1,.12,"#b0e0ec");
        for(let i=-4.5;i<=4.5;i+=1.5)renderer.box(bus.x+i,bus.y+.65,bus.z+side*1.8,.10,1.8,.12,"#3e82c8");
      }
      for(const end of [-4.5,4.5]){
        renderer.box(bus.x+end,bus.y-.7,bus.z,.12,1.4,3.5,"#3e82c8");
        renderer.box(bus.x+end,bus.y+1.1,bus.z,.12,.5,3.5,"#3e82c8");
      }
      for(const side of [-1,1])for(const end of [-3,3])renderer.box(bus.x+end,bus.y-1.5,bus.z+side*1.8,.9,1,.25,"#273849");
      renderer.box(bus.x,bus.y+9,bus.z,7,8,7,"#65b9e7");
      renderer.box(bus.x,bus.y+5,bus.z,.15,5,.15,"#eee1b2");
    }
    for(let i=0;i<80;i++){
      const angle=i*TAU/80,r=storm.radius;
      renderer.box(CENTER+Math.sin(angle)*r,3,CENTER+Math.cos(angle)*r,.12,6,.12,"#cd85ff",0,true);
      renderer.box(CENTER+Math.sin(angle)*r,.15,CENTER+Math.cos(angle)*r,Math.max(.12,r*TAU/80),.2,.14,"#b978f2",angle,true);
    }
    for(const t of traces){
      const length=Math.hypot(...t.to.map((n,i)=>n-t.from[i]));
      for(let i=0;i<5;i++){
        const f=.35+i*.12;renderer.box(t.from[0]+(t.to[0]-t.from[0])*f,t.from[1]+(t.to[1]-t.from[1])*f,t.from[2]+(t.to[2]-t.from[2])*f,.035,.035,Math.min(.22,length/12),t.color,0,true);
      }
    }
    updateNameplates(watch);
    if(state!=="menu"&&watch.hp>0&&!watch.onBus&&!watch.dropping)renderer.viewGun(watch.weapons[watch.slot],kick,elapsed,watch.moving,aiming,watch.weapons[watch.slot].reloadLeft>0);
    if(watch.glider&&watch.hp>0){
      renderer.box(watch.x,watch.y+3,watch.z,3.5,.15,2.3,"#65d8ff",-watch.yaw);
      for(const side of [-1,1])renderer.box(watch.x+side*.55,watch.y+2.3,watch.z,.03,1.4,.03,"#eaf0ee");
    }
    drawMap();
  }
  function updateNameplates(watch){
    if(!online){$("nameplates").hidden=true;return;}
    $("nameplates").hidden=false;
    for(const a of actors){
      let label=nameLabels.get(a.id);
      if(!label){label=document.createElement("span");label.className="nameplate";nameLabels.set(a.id,label);$("nameplates").append(label);}
      const p=a.hp>0&&a!==watch&&!a.onBus&&dist(a,watch)<45?renderer.project(a.x,a.y+2.5,a.z):null;
      label.hidden=!p||p.x<0||p.x>innerWidth||p.y<0||p.y>innerHeight;
      if(!label.hidden){
        label.style.left=p.x+"px";label.style.top=p.y+"px";label.style.color=friendly(a)?"#88edff":"#ffffff";
        label.textContent=a.username;
      }
    }
  }
  function drawMap(){
    const c=mapCtx,s=3,x=n=>n*s;
    c.clearRect(0,0,420,420);c.fillStyle="#35674e";c.fillRect(0,0,420,420);
    c.strokeStyle="#76977d";c.lineWidth=1;
    for(let i=0;i<=140;i+=20){c.beginPath();c.moveTo(x(i),0);c.lineTo(x(i),420);c.moveTo(0,x(i));c.lineTo(420,x(i));c.stroke();}
    for(const o of scenery){c.fillStyle=o.kind==="hut"?"#bd9b79":"#27513e";c.fillRect(x(o.x-o.w/2),x(o.z-o.d/2),x(o.w),x(o.d));}
    c.beginPath();c.rect(0,0,420,420);c.arc(210,210,x(storm.radius),0,TAU,true);c.fillStyle="#9d65dca0";c.fill("evenodd");
    c.beginPath();c.arc(210,210,x(storm.radius),0,TAU);c.strokeStyle="#ecd3ff";c.lineWidth=3;c.stroke();
    c.font="bold 12px Segoe UI";c.textAlign="center";
    for(const v of latest?.vans||[]){
      c.fillStyle="#65efff";c.fillRect(x(v.x)-5,x(v.z)-5,10,10);if(mapOpen)c.fillText("REBOOT",x(v.x),x(v.z)-10);
    }
    if(bus?.active){
      c.setLineDash([6,6]);c.strokeStyle="#ffeb91";c.beginPath();c.moveTo(30,210);c.lineTo(390,210);c.stroke();c.setLineDash([]);
      c.fillStyle="#ffeb91";c.fillRect(x(bus.x)-6,204,12,12);
    }
    for(const a of actors.filter(a=>a.hp>0&&a.team===player.team)){
      c.fillStyle=a===player?"#ffffff":"#65efff";c.beginPath();c.arc(x(a.x),x(a.z),a===player?5:4,0,TAU);c.fill();
      if(mapOpen)c.fillText(a.username||"YOU",x(a.x),x(a.z)-9);
    }
    c.fillStyle="#f0f7f8";c.fillText(mapOpen?"ISLAND MAP · M TO CLOSE":"N",210,18);
  }
  function backToMenu(){
    online=false;latest=null;bus=null;onlineFinished=false;state="menu";initialize();
    for(const id of ["lobby","result","pause","hud"])$(id).hidden=true;
    $("menu").hidden=false;$("nameplates").replaceChildren();nameLabels.clear();
    keys.clear();input.fire=false;input.aim=false;if(document.pointerLockElement)document.exitPointerLock();
  }
  net.onLobby=()=>{
    state="lobby";$("menu").hidden=true;$("lobby").hidden=false;$("hud").hidden=true;$("result").hidden=true;onlineFinished=false;
  };
  net.onLeft=backToMenu;
  net.onDisconnect=()=>{if(online||state==="lobby")backToMenu();};
  net.onSnapshot=data=>{
    if(!online){
      online=true;state="playing";$("lobby").hidden=true;$("menu").hidden=true;$("hud").hidden=false;nameLabels.clear();$("nameplates").replaceChildren();
      lockMouse();
    }
    latest=data;mode=data.mode;elapsed=data.elapsed;Object.assign(storm,data.storm);scenery=data.scenery;walls=data.walls;loot=data.loot;traces=data.traces;bus=data.bus;
    const old=new Map(actors.map(a=>[a.connection,a]));
    actors=data.actors.map(a=>{
      const previous=old.get(a.connection);
      if(a.connection===net.id&&previous){a.yaw=previous.yaw;a.pitch=previous.pitch;}
      a.human=a.connection===net.id;return a;
    });
    player=actors.find(a=>a.connection===net.id);
    if(!player){backToMenu();return;}
    teammate=actors.find(a=>a!==player&&a.team===player.team);
    kills=player.kills;nearby=loot.filter(i=>i.kind==="gun"&&dist(player,i)<2.7).sort((a,b)=>dist(player,a)-dist(player,b))[0]||null;
    updateHud();
    if(data.phase==="finished"&&!onlineFinished){onlineFinished=true;finish();}
  };
  function onlineTick(dt){
    inputClock+=dt;kick=Math.max(0,kick-dt*7);
    if(inputClock<.05||!player||onlineFinished)return;inputClock=0;
    const active=state==="playing"&&player.hp>0;
    net.send({type:"input",yaw:player.yaw,pitch:player.pitch,
      forward:active?Number(keys.has("KeyW")||keys.has("ArrowUp"))-Number(keys.has("KeyS")||keys.has("ArrowDown")):0,
      strafe:active?Number(keys.has("KeyD")||keys.has("ArrowRight"))-Number(keys.has("KeyA")||keys.has("ArrowLeft")):0,
      sprint:active&&(keys.has("ShiftLeft")||keys.has("ShiftRight")),fire:active&&input.fire,aim:active&&input.aim,reboot:active&&keys.has("KeyH")});
    if(active&&input.fire)kick=.8;
  }
  function openArmory(){
    $("armory").hidden=false;
    if(state==="playing")pause(true);
  }
  $("play").onclick=start;$("again").onclick=()=>{if(online)net.send({type:"leave"});else start();};$("resume").onclick=()=>pause(false);
  $("leaveMatch").onclick=()=>{if(online)net.send({type:"leave"});else backToMenu();};
  $("mode").onchange=()=>{$("play").textContent=$("mode").value.startsWith("online")?"CREATE HUMAN ROOM →":"DROP INTO PRACTICE →";};
  $("armoryButton").onclick=openArmory;$("closeArmory").onclick=()=>{$("armory").hidden=true;};
  for(const tier of W.rarities){const span=document.createElement("span");span.textContent=tier.name;span.style.color=tier.color;$("rarityLegend").append(span);}
  for(const gun of W.guns){
    const entry=document.createElement("div");entry.className="gun-entry";
    const name=document.createElement("strong");name.textContent=gun.name;
    const detail=document.createElement("small");
    detail.textContent=`${gun.type} · ${gun.damage}${gun.pellets>1?" × "+gun.pellets:""} DMG · ${gun.mag} rounds · ${gun.range}m`;
    entry.append(name,detail);$("gunList").append(entry);
  }
  addEventListener("keydown",e=>{
    if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();
    if(e.code==="Escape"&&!e.repeat){pause(state==="playing");return;}
    if(e.code==="KeyM"&&!e.repeat&&["playing","paused"].includes(state)){mapOpen=!mapOpen;$("map").classList.toggle("expanded",mapOpen);return;}
    if(state!=="playing"||player.hp<=0)return;
    keys.add(e.code);if(e.repeat)return;
    if(online){
      const commands={KeyR:"reload",KeyQ:"build",KeyF:"heal",KeyE:"pickup",Space:"jump",KeyG:"glider"};
      if(commands[e.code])net.send({type:"command",name:commands[e.code]});
      if(e.code==="Digit1"||e.code==="Digit2")net.send({type:"command",name:"swap",slot:e.code==="Digit1"?0:1});
      return;
    }
    if(e.code==="KeyR")reload(player);
    if(e.code==="KeyQ")build();
    if(e.code==="KeyF")heal();
    if(e.code==="Digit1")swap(0);
    if(e.code==="Digit2")swap(1);
    if(e.code==="Space"){
      if(player.onBus)jumpFromBus(player);
      else if(player.y===0)player.vy=6.5;
    }
    if(e.code==="KeyG"&&player.dropping&&player.y>3)player.glider=!player.glider;
    if(e.code==="KeyE"&&nearby)pickupGun(player,nearby);
  });
  addEventListener("keyup",e=>keys.delete(e.code));
  canvas.addEventListener("mousedown",e=>{
    if(state!=="playing"||player.hp<=0)return;
    if(document.pointerLockElement!==canvas)lockMouse();
    if(e.button===0)input.fire=true;if(e.button===2)input.aim=true;
  });
  addEventListener("mouseup",e=>{if(e.button===0)input.fire=false;if(e.button===2)input.aim=false;});
  addEventListener("mousemove",e=>{
    if(state!=="playing"||player.hp<=0)return;
    if(document.pointerLockElement!==canvas&&!input.fire&&!input.aim)return;
    const sensitivity=input.aim?.0014:.0026;
    player.yaw+=e.movementX*sensitivity;player.pitch=clamp(player.pitch-e.movementY*sensitivity,-1.4,1.4);
  });
  document.addEventListener("pointerlockchange",()=>{if(!document.pointerLockElement&&state==="playing")pause(true);});
  addEventListener("blur",()=>{if(state==="playing")pause(true);});
  canvas.addEventListener("contextmenu",e=>e.preventDefault());
  initialize();
  function frame(time){
    const dt=Math.min(.04,(time-last)/1000||.016);last=time;
    if(online)onlineTick(dt);
    else if(state==="playing")update(dt);
    else if(state==="menu")elapsed+=dt;
    if(state!=="error")render();
    requestAnimationFrame(frame);
  }
  function runTests(){
    const results=[],assert=(ok,text)=>{if(!ok)throw new Error(text);};
    const test=(name,fn)=>{fn();results.push(name);};
    try{
      test("40 distinct models, five meaningful rarity tiers, all models lootable",()=>{
        assert(W.guns.length===40&&new Set(W.guns.map(g=>g.name)).size===40,"gun count");
        assert(W.rarities.length===5,"rarity count");
        for(const base of W.guns){
          const common=W.create(base.id,0),legend=W.create(base.id,4);
          assert(legend.damage>common.damage&&legend.spread<common.spread&&legend.reloadTime<common.reloadTime,"rarity stats");
          assert(common.mag>0&&common.rate>0&&common.range>0,"gun stats");
        }
        assert(new Set(loot.filter(i=>i.kind==="gun").map(i=>i.weapon.id)).size===40,"missing island gun");
        assert($("gunList").children.length===40,"armory UI count");
      });
      test("solo and duos safe spawns and team assignments",()=>{
        initialize("solo");assert(alive().length===24&&teams().size===24&&!teammate,"solo");
        initialize("duo");assert(alive().length===24&&teams().size===12&&teammate.team===player.team,"duos");
        assert(actors.every(a=>!blocked(a.x,a.z)),"unsafe spawn");
        for(const team of teams())assert(actors.filter(a=>a.team===team).length===2,"not a pair");
      });
      test("friendly fire protection, shield damage, enemy eliminations",()=>{
        const before=teammate.hp;hurt(teammate,200,player);assert(teammate.hp===before,"friendly fire");
        const enemy=actors[2];enemy.shield=25;hurt(enemy,40,player);
        assert(enemy.shield===0&&enemy.hp===85,"shield damage");
        hurt(enemy,200,player);assert(enemy.hp===0&&kills===1,"elimination");
      });
      test("3D rays respect cover, headshots, and allied blockers",()=>{
        initialize("duo");scenery=[];walls=[];actors=actors.slice(0,3);
        player.x=70;player.z=70;teammate.x=80;teammate.z=70;
        const enemy=actors[2];enemy.x=70;enemy.z=60;enemy.shield=0;
        walls=[box(70,65,3,.22,2.7,"wall")];
        shootRay(player,[0,0,-1],20,50);assert(enemy.hp===100&&walls[0].hp===160,"cover did not stop shot");
        walls=[];shootRay(player,[0,0,-1],20,50);assert(enemy.hp===70,"headshot");
        teammate.x=70;teammate.z=65;shootRay(player,[0,0,-1],20,50);
        assert(enemy.hp===70&&teammate.hp===100,"allied shot blocking");
        assert(rayBox([0,0,0],[0,1,0],{x:2,y:2,z:0,w:1,h:1,d:1})===Infinity,"parallel ray");
      });
      test("40 guns fire, burst counts, ammunition, and reload limits",()=>{
        initialize();scenery=[];walls=[];actors=[player];player.yaw=0;
        for(const base of W.guns){
          player.weapons[0]=W.create(base.id,2);player.slot=0;input.aim=false;
          const weapon=player.weapons[0];fire(player);
          for(let i=0;i<6;i++)tickWeapons(player,.04);
          assert(weapon.ammo===weapon.mag-weapon.burst,base.name+" fire accounting");
          assert(weapon.cooldown>=0&&traces.length>0,"shot trace");
        }
        player.weapons[0]=W.create(0);const w=player.weapons[0];w.ammo=w.mag-10;w.reserve=3;
        reload(player);tickWeapons(player,4);
        assert(w.ammo===w.mag-7&&w.reserve===0&&w.reloadLeft===0,"reload limits");
      });
      test("weapon swapping and looting preserve ammo and rarity",()=>{
        initialize();player.weapons[0].ammo=7;swap(1);assert(player.slot===1,"swap");
        const item={x:70,z:70,weapon:W.create(18,4)};
        pickupGun(player,item);assert(player.weapons[1].id===18&&player.weapons[1].rarity===4,"loot");
        swap(0);assert(player.weapons[0].ammo===7,"ammo reset on swap");
      });
      test("building collision, healing, movement, jump, and pause",()=>{
        initialize();scenery=[];player.yaw=0;build();
        assert(walls.length===1&&player.wood===80&&blocked(70,67.5),"build");
        const count=walls.length;build();assert(walls.length===count,"build cooldown");
        player.hp=65;heal();assert(player.hp===100&&player.meds===1,"heal");
        player.shield=90;collect(player,{kind:"shield"});assert(player.shield===100,"shield cap");
        state="playing";keys.add("KeyD");const x=player.x;update(.04);keys.clear();assert(player.x>x,"movement");
        player.vy=6.5;update(.04);assert(player.y>0,"jump");
        pause(true);assert(state==="paused","pause");pause(false);assert(state==="playing","resume");
      });
      test("duo teammate follows, ignores allies, and continues after player death",()=>{
        initialize("duo");scenery=[];walls=[];actors.forEach(a=>a.target=null);
        player.x=70;player.z=70;teammate.x=80;teammate.z=70;
        actors.slice(2).forEach((a,i)=>{a.x=5+i*.5;a.z=5;});
        const before=dist(player,teammate);bot(teammate,.2);
        assert(dist(player,teammate)<before&&(!teammate.target||teammate.target.team!==teammate.team),"teammate behavior");
        hurt(player,200,null);state="playing";update(.016);
        assert(state==="playing"&&followed()===teammate&&$("teamStatus").textContent.includes("SPECTATING"),"duo death ended match");
        actors.slice(2).forEach(a=>a.hp=0);update(.016);
        assert(state==="finished"&&$("resultTitle").textContent==="VICTORY!","shared duo victory");
        initialize("duo");player.hp=0;teammate.hp=0;state="playing";update(.016);
        assert(state==="finished"&&$("resultTitle").textContent==="OUTLASTED","team loss");
      });
      test("storm shrink, simulation, solo victory, and restart",()=>{
        initialize("solo");state="playing";
        for(let i=0;i<1500&&state==="playing";i++){player.hp=100;player.shield=100;update(1/60);}
        assert(storm.radius<100&&actors.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.z)),"storm/simulation");
        elapsed=300;update(.016);assert(storm.radius===0,"storm closure");
        initialize("solo");actors.slice(1).forEach(a=>a.hp=0);state="playing";update(.016);
        assert(state==="finished"&&$("resultTitle").textContent==="VICTORY!","solo victory");
        initialize("duo");assert(teams().size===12&&player.hp===100&&walls.length===0&&kills===0,"restart");
      });
      test("practice starts inside a flying bus, Space exits, and gliders steer and land",()=>{
        const selected=$("mode").value;
        for(const practice of ["practice-solo","practice-duo"]){
          $("mode").value=practice;start();
          assert(bus.active&&actors.every(a=>a.onBus)&&player.y===31.75,"practice did not board the bus");
          const busX=bus.x,ammo=player.weapons[0].ammo;
          hurt(player,1000,null);input.fire=true;update(.1);input.fire=false;
          assert(bus.x>busX&&player.hp===100&&player.weapons[0].ammo===ammo&&storm.radius===100,"unsafe bus flight");
          render();assert(renderer.gl.getError()===renderer.gl.NO_ERROR,"bus cabin render");
          dispatchEvent(new KeyboardEvent("keydown",{code:"Space"}));
          assert(!player.onBus&&player.dropping,"Space did not exit bus");
          dispatchEvent(new KeyboardEvent("keyup",{code:"Space"}));
          dispatchEvent(new KeyboardEvent("keydown",{code:"KeyG"}));
          dispatchEvent(new KeyboardEvent("keyup",{code:"KeyG"}));
          assert(player.glider,"G did not deploy glider");
          const x=player.x,y=player.y;keys.add("KeyW");update(.1);keys.clear();
          assert(player.x>x&&player.y<y&&Math.abs(player.y-y)<.5,"glider did not steer or slow descent");
          if(teammate)assert(!teammate.onBus,"duo teammate did not follow the drop");
          player.glider=false;player.y=15;update(.04);
          assert(player.glider,"near-ground automatic glider deployment");
          render();assert(renderer.gl.getError()===renderer.gl.NO_ERROR,"glider render");
          for(let i=0;i<200&&player.dropping;i++){player.hp=100;player.shield=100;update(.04);}
          assert(player.y===0&&!player.glider&&!player.dropping&&!blocked(player.x,player.z),"unsafe glider landing");
          start();elapsed=17.99;update(.02);
          assert(!bus.active&&actors.every(a=>!a.onBus),"bus did not automatically eject remaining passengers");
          start();assert(player.onBus&&bus.active&&elapsed===0,"restart did not return to bus");
        }
        $("mode").value=selected;initialize("solo");
      });
      test("real WebGL rendering, visible geometry, shader and GPU validation",()=>{
        initialize("duo");state="playing";
        $("menu").hidden=true;$("result").hidden=true;$("pause").hidden=true;$("hud").hidden=false;
        teammate.x=72;teammate.z=64;
        const enemy=actors[2];enemy.x=68;enemy.z=60;enemy.yaw=Math.PI;
        render();
        assert(renderer.drawCalls>200,"missing geometry");
        assert(renderer.gl.getError()===renderer.gl.NO_ERROR,"WebGL error");
        const pixel=new Uint8Array(4);
        renderer.gl.readPixels(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1,renderer.gl.RGBA,renderer.gl.UNSIGNED_BYTE,pixel);
        assert(pixel[3]===255&&(pixel[0]+pixel[1]+pixel[2])>0,"no rendered pixels");
        document.body.dataset.drawCalls=renderer.drawCalls;
      });
      document.body.dataset.test="passed";
      const output=document.createElement("pre");output.id="test-results";
      output.textContent=`PASS: ${results.length} browser regression tests\n${results.join("\n")}`;document.body.append(output);
    }catch(error){
      document.body.dataset.test="failed";const output=document.createElement("pre");output.id="test-results";output.textContent=error.stack;document.body.append(output);
    }
  }
  if(location.search==="?test")runTests();else requestAnimationFrame(frame);
  if(location.search==="?online-test"){
    $("username").value="BrowserHost";$("serverUrl").value=location.origin;
    let guest,stage=0;
    const original=net.onSnapshot;
    net.onSnapshot=data=>{
      original(data);
      try{
        if(stage===0){
          if(data.actors.length!==2||!data.actors.every(a=>a.username)||!data.bus.active)throw new Error("Human room or battle bus missing.");
          stage=1;net.send({type:"command",name:"jump"});guest.send(JSON.stringify({type:"command",name:"jump"}));
        }else if(stage===1&&player.dropping&&!player.onBus){
          stage=2;net.send({type:"command",name:"glider"});
        }else if(stage===2&&player.glider&&player.y<30){
          player.pitch=-.45;
          if($("map").hidden||$("hud").hidden||!$("menu").hidden)throw new Error("Game or map UI missing.");
          render();if(renderer.gl.getError()!==renderer.gl.NO_ERROR)throw new Error("Online rendering error.");
          document.body.dataset.onlineTest="passed";
          document.body.dataset.humanPlayers=data.actors.length;
        }
      }catch(error){document.body.dataset.onlineTest="failed";document.body.dataset.error=error.message;}
    };
    const originalLobby=net.onLobby;
    net.onLobby=data=>{
      originalLobby(data);
      if(data.members.length===1&&!guest){
        guest=new WebSocket(location.origin.replace(/^http/,"ws")+"/socket");
        guest.onopen=()=>guest.send(JSON.stringify({type:"hello",username:"BrowserGuest"}));
        guest.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.type==="profile")guest.send(JSON.stringify({type:"join",code:data.code}));};
      }
      if(data.members.length===2)net.send({type:"start"});
    };
    net.create();
  }
})();
