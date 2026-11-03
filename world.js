"use strict";
const W = require("./weapons");
const crypto = require("node:crypto");
const WORLD = 140, CENTER = 70;
const rand = (a,b) => a + Math.random()*(b-a);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const dist = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const SKINS = [
  {id:"scout",name:"Island Scout",color:"#738ecc",skin:"#edb58d",cost:0},
  {id:"wave",name:"Wave Runner",color:"#42c9d9",skin:"#8f5d42",cost:80},
  {id:"ember",name:"Ember Guard",color:"#eb755c",skin:"#c88e67",cost:100},
  {id:"orchid",name:"Orchid Ranger",color:"#b388dc",skin:"#e4a783",cost:120},
  {id:"gold",name:"Golden Voyager",color:"#e5b856",skin:"#8f5d42",cost:160},
  {id:"forest",name:"Forest Sentinel",color:"#68ad72",skin:"#edb58d",cost:100},
  {id:"rose",name:"Rose Striker",color:"#d875a3",skin:"#c88e67",cost:120},
  {id:"night",name:"Night Pilot",color:"#425878",skin:"#e4a783",cost:180}
];
const VANS = [{x:70,z:70},{x:35,z:105},{x:105,z:35}];
function box(x,z,w,d,h,kind){return {x,z,w,d,h,y:h/2,kind,hp:kind==="wall"?180:280};}
function collide(x,z,r,o){
  return Math.hypot(x-clamp(x,o.x-o.w/2,o.x+o.w/2),z-clamp(z,o.z-o.d/2,o.z+o.d/2))<r;
}
function rayBox(origin,dir,o){
  let near=0,far=Infinity;
  for(let i=0;i<3;i++){
    const size=[o.w,o.h,o.d][i],center=[o.x,o.y,o.z][i],lo=center-size/2,hi=center+size/2;
    if(Math.abs(dir[i])<1e-8){if(origin[i]<lo||origin[i]>hi)return Infinity;}
    else{let a=(lo-origin[i])/dir[i],b=(hi-origin[i])/dir[i];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return Infinity;}
  }
  return near;
}
class World {
  constructor(players,mode="solo",onAward=()=>{}){
    this.mode=mode;this.elapsed=0;this.phase="bus";this.storm={x:70,z:70,radius:100};
    this.scenery=[];this.walls=[];this.loot=[];this.traces=[];this.onAward=onAward;this.vans=VANS;
    this.actors=players.map((p,i)=>{
      const skin=SKINS.find(s=>s.id===p.skin)||SKINS[0];
      return {id:i,connection:p.id,username:p.username,team:mode==="duo"?Math.floor(i/2):i,
        x:10+(i%6-2.5)*.9,z:70+(Math.floor(i/6)-1.5)*.9,y:31.75,vy:0,hp:100,shield:50,yaw:Math.PI/2,pitch:0,skin:skin.skin,color:skin.color,
        slot:0,weapons:[W.create(0,1),W.create(20)],wood:100,meds:2,onBus:true,dropping:false,glider:false,
        cards:[],reboot:0,buildCooldown:0,kills:0,connected:true,moving:false,input:{},lastInput:0};
    });
    for(let i=0;i<65;i++){
      const x=rand(5,135),z=rand(5,135);if(VANS.some(v=>dist(v,{x,z})<7))continue;
      const kind=i%4===0?"hut":i%3===0?"rock":"tree";
      const o=box(x,z,kind==="hut"?4:kind==="tree"?1.2:2.8,kind==="hut"?4:kind==="tree"?1.2:2.8,kind==="hut"?3.5:kind==="tree"?5:1.4,kind);
      if(!this.scenery.some(b=>Math.abs(b.x-x)<(b.w+o.w)/2+1&&Math.abs(b.z-z)<(b.d+o.d)/2+1))this.scenery.push(o);
    }
    for(const v of VANS)this.scenery.push(box(v.x,v.z,2.6,4.5,2.7,"van"));
    for(const gun of W.guns)this.loot.push({...this.spawn(),kind:"gun",weapon:W.create(gun.id,W.roll())});
    for(let i=0;i<65;i++)this.loot.push({...this.spawn(),kind:["ammo","wood","shield","medkit"][i%4]});
  }
  alive(){return this.actors.filter(a=>a.hp>0);}
  teams(){return new Set(this.alive().map(a=>a.team));}
  blocked(x,z,r=.38){return x<r||z<r||x>WORLD-r||z>WORLD-r||[...this.scenery,...this.walls].some(o=>collide(x,z,r,o));}
  spawn(){
    for(let i=0;i<1500;i++){const p={x:rand(5,135),z:rand(5,135)};if(!this.blocked(p.x,p.z,1))return p;}
    return {x:20,z:20};
  }
  input(a,data){
    if(!a||!a.connected||a.hp<=0||this.phase==="finished")return;
    const n=v=>Number.isFinite(v)?clamp(v,-1,1):0;
    a.input={forward:n(data.forward),strafe:n(data.strafe),sprint:data.sprint===true,aim:data.aim===true,fire:data.fire===true,reboot:data.reboot===true};
    if(Number.isFinite(data.yaw))a.yaw=((data.yaw%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
    if(Number.isFinite(data.pitch))a.pitch=clamp(data.pitch,-1.4,1.4);
    a.lastInput=this.elapsed;
  }
  command(a,name,data={}){
    if(!a||a.hp<=0||!a.connected||this.phase==="finished")return;
    if(name==="jump"){
      if(a.onBus){
        a.onBus=false;a.dropping=true;a.vy=0;
        a.z=70+(a.id%2===0?-3.2:3.2);
      }
      else if(a.y===0)a.vy=6.5;
    }
    if(name==="glider"&&a.dropping&&a.y>3)a.glider=!a.glider;
    if(a.onBus||a.dropping)return;
    const w=a.weapons[a.slot];
    if(name==="swap"&&(data.slot===0||data.slot===1)){w.burstLeft=0;a.slot=data.slot;}
    if(name==="reload")this.reload(a);
    if(name==="heal"&&a.meds>0&&a.hp<100){a.meds--;a.hp=Math.min(100,a.hp+50);}
    if(name==="build")this.build(a);
    if(name==="pickup"){
      const item=this.loot.filter(i=>i.kind==="gun"&&dist(a,i)<2.7).sort((b,c)=>dist(a,b)-dist(a,c))[0];
      if(item){w.burstLeft=0;w.reloadLeft=0;a.weapons[a.slot]=item.weapon;item.weapon=w;item.x=a.x+1;item.z=a.z+1;}
    }
  }
  build(a){
    if(a.buildCooldown>0||a.wood<20||this.walls.length>=160)return;
    const sideways=Math.abs(Math.sin(a.yaw))>Math.abs(Math.cos(a.yaw));
    const o=box(a.x+Math.sin(a.yaw)*2.5,a.z-Math.cos(a.yaw)*2.5,sideways?.22:3.4,sideways?3.4:.22,2.7,"wall");
    if(o.x-o.w/2<0||o.z-o.d/2<0||o.x+o.w/2>140||o.z+o.d/2>140||
      [...this.scenery,...this.walls].some(b=>Math.abs(b.x-o.x)<(b.w+o.w)/2&&Math.abs(b.z-o.z)<(b.d+o.d)/2)||
      this.alive().some(b=>collide(b.x,b.z,.5,o)))return;
    this.walls.push(o);a.wood-=20;a.buildCooldown=.4;
  }
  reload(a){
    const w=a.weapons[a.slot];
    if(!w.reloadLeft&&w.ammo<w.mag&&w.reserve>0){w.reloadLeft=w.reloadTime;w.burstLeft=0;}
  }
  hurt(a,damage,attacker){
    if(a.hp<=0||a.onBus||attacker&&attacker.team===a.team)return;
    const shield=Math.min(a.shield,damage);a.shield-=shield;a.hp=Math.max(0,a.hp-damage+shield);a.reboot=0;
    if(a.hp===0){
      this.loot.push({x:a.x,z:a.z,kind:"gun",weapon:a.weapons[a.slot]},{x:a.x+.4,z:a.z,kind:"ammo"});
      if(this.mode==="duo")this.loot.push({x:a.x,z:a.z,kind:"card",team:a.team,actorId:a.id});
      if(attacker)attacker.kills++;
    }
  }
  disconnect(id){
    const a=this.actors.find(a=>a.connection===id);if(!a)return;
    a.connected=false;a.onBus=false;this.hurt(a,1000,null);
  }
  shoot(a){
    const w=a.weapons[a.slot];if(w.ammo<=0||w.reloadLeft>0||a.onBus||a.dropping)return;
    w.ammo--;
    for(let i=0;i<w.pellets;i++){
      const spread=w.spread*(a.input.aim?.45:1),yaw=a.yaw+rand(-spread,spread),pitch=a.pitch+rand(-spread,spread);
      const dir=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)],origin=[a.x,a.y+1.55,a.z];
      let nearest=w.range,hit=null;
      for(const o of [...this.scenery,...this.walls]){const t=rayBox(origin,dir,o);if(t<nearest){nearest=t;hit={o};}}
      for(const target of this.alive()){
        if(target===a||target.onBus)continue;
        const t=rayBox(origin,dir,{x:target.x,y:target.y+.95,z:target.z,w:.62,h:1.9,d:.62});
        if(t<nearest){nearest=t;hit={target};}
      }
      const end=origin.map((n,j)=>n+dir[j]*nearest);this.traces.push({from:origin,to:end,life:.12,team:a.team,color:"#ffe49a"});
      if(hit&&hit.o&&hit.o.kind!=="van"){
        hit.o.hp-=w.damage;
        if(hit.o.hp<=0){this.scenery=this.scenery.filter(o=>o!==hit.o);this.walls=this.walls.filter(o=>o!==hit.o);this.loot.push({x:hit.o.x,z:hit.o.z,kind:"wood"});}
      }
      if(hit&&hit.target)this.hurt(hit.target,w.damage*(end[1]>hit.target.y+1.48?1.5:1),a);
    }
  }
  tickWeapon(a,dt){
    a.weapons.forEach((w,i)=>{
      w.cooldown=Math.max(0,w.cooldown-dt);
      if(w.reloadLeft>0){w.reloadLeft=Math.max(0,w.reloadLeft-dt);if(w.reloadLeft===0){const n=Math.min(w.mag-w.ammo,w.reserve);w.ammo+=n;w.reserve-=n;}}
      if(i===a.slot&&w.burstLeft>0){
        w.burstTime-=dt;if(w.burstTime<=0){this.shoot(a);w.burstLeft--;w.burstTime=.07;}
      }
    });
    const w=a.weapons[a.slot];
    if(a.input.fire&&!w.cooldown&&!w.reloadLeft&&!w.burstLeft&&!a.onBus&&!a.dropping){
      if(!w.ammo)this.reload(a);
      else{this.shoot(a);w.cooldown=w.rate;w.burstLeft=Math.min(w.burst-1,w.ammo);w.burstTime=.07;}
    }
  }
  reboot(a,dt){
    const card=a.cards.find(id=>this.actors.some(b=>b.id===id&&b.hp<=0&&b.connected&&b.team===a.team));
    const van=VANS.find(v=>dist(a,v)<4.5);
    if(card===undefined||!van||!a.input.reboot||a.moving||a.input.fire||a.y>0){a.reboot=0;return;}
    a.reboot+=dt;
    if(a.reboot>=6){
      const b=this.actors.find(b=>b.id===card);a.cards=a.cards.filter(id=>id!==card);a.reboot=0;
      Object.assign(b,{x:van.x+3,z:van.z,y:16,vy:0,hp:100,shield:0,onBus:false,dropping:true,glider:true,slot:0,input:{}});
      b.weapons=[W.create(0),W.create(20)];
    }
  }
  update(dt){
    if(this.phase==="finished")return;
    this.elapsed+=dt;if(this.elapsed>=18)this.phase="playing";
    this.storm.radius=Math.max(0,100-Math.max(0,this.elapsed-38)*.38);
    const busX=10+Math.min(1,this.elapsed/18)*120;
    for(const a of this.actors){
      if(a.hp<=0)continue;
      a.buildCooldown=Math.max(0,a.buildCooldown-dt);
      if(this.elapsed-a.lastInput>.4)a.input={};
      if(a.onBus){
        a.x=clamp(busX+(a.id%6-2.5)*.9,.4,139.6);a.z=70+(Math.floor(a.id/6)-1.5)*.9;a.y=31.75;a.moving=false;
        if(this.elapsed>=18)this.command(a,"jump");
        continue;
      }
      const input=a.input,forward=input.forward||0,strafe=input.strafe||0;
      const dx=Math.sin(a.yaw)*forward+Math.cos(a.yaw)*strafe,dz=-Math.cos(a.yaw)*forward+Math.sin(a.yaw)*strafe;
      const length=Math.hypot(dx,dz);a.moving=length>0;
      if(length){
        const speed=a.dropping?(a.glider?11:8):input.aim?3.2:input.sprint?9:6;
        const x=clamp(a.x+dx/length*speed*dt,.4,139.6),z=clamp(a.z+dz/length*speed*dt,.4,139.6);
        if(a.dropping||!this.blocked(x,a.z))a.x=x;if(a.dropping||!this.blocked(a.x,z))a.z=z;
      }
      if(a.dropping&&a.y<16)a.glider=true;
      a.vy=a.glider?-3.8:a.vy-18*dt;a.y=Math.max(0,a.y+a.vy*dt);
      if(a.y===0){
        a.vy=0;a.dropping=false;a.glider=false;
        if(this.blocked(a.x,a.z)){
          let found=false;
          for(let radius=.5;radius<8&&!found;radius+=.5)for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8){
            const x=a.x+Math.sin(angle)*radius,z=a.z+Math.cos(angle)*radius;
            if(!this.blocked(x,z)){a.x=x;a.z=z;found=true;break;}
          }
        }
      }
      this.tickWeapon(a,dt);
      if(dist(a,this.storm)>this.storm.radius)this.hurt(a,dt*(this.elapsed>218?18:7),null);
      for(let i=this.loot.length-1;i>=0;i--){
        const item=this.loot[i];if(dist(a,item)>1.2||a.y>1)continue;
        let used=true;
        if(item.kind==="ammo")a.weapons.forEach(w=>w.reserve+=w.mag*2);
        else if(item.kind==="wood")a.wood=Math.min(999,a.wood+40);
        else if(item.kind==="shield"){if(a.shield<100)a.shield=Math.min(100,a.shield+35);else used=false;}
        else if(item.kind==="medkit"){if(a.meds<5)a.meds++;else used=false;}
        else if(item.kind==="card"){
          if(item.team===a.team&&item.actorId!==a.id&&!a.cards.includes(item.actorId))a.cards.push(item.actorId);else used=false;
        }else used=false;
        if(used)this.loot.splice(i,1);
      }
      this.reboot(a,dt);
    }
    this.traces.forEach(t=>t.life-=dt);this.traces=this.traces.filter(t=>t.life>0);
    if(this.loot.length>300)this.loot=this.loot.slice(-300);
    if(this.teams().size<=1){
      this.phase="finished";const winningTeam=this.alive()[0]?.team;
      for(const a of this.actors)if(a.connected)this.onAward(a.connection,this.elapsed>=30?(a.team===winningTeam?60:20)+a.kills*10:0);
    }
  }
  snapshot(){
    return {mode:this.mode,elapsed:this.elapsed,phase:this.phase,storm:this.storm,
      actors:this.actors.map(({input,lastInput,...a})=>a),scenery:this.scenery,walls:this.walls,loot:this.loot,traces:this.traces,vans:VANS,
      bus:{x:10+Math.min(1,this.elapsed/18)*120,y:33,z:70,active:this.elapsed<18}};
  }
}
function profile(username){return {id:crypto.randomUUID(),username,coins:200,unlocked:["scout"],skin:"scout",version:0};}
module.exports={World,SKINS,VANS,profile,rayBox};
