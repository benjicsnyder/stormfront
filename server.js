"use strict";
const http=require("node:http"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {WebSocketServer,WebSocket}=require("ws");
const {World,SKINS,profile}=require("./world");
function createServer(options={}){
  const secret=options.secret||process.env.PROFILE_SECRET||crypto.randomBytes(32).toString("hex");
  const rooms=new Map(),clients=new Map(),profiles=new Map();
  const files=new Set(["index.html","style.css","weapons.js","renderer3d.js","game.js","online.js","config.js"]);
  const server=http.createServer((req,res)=>{
    const name=req.url.split("?")[0];
    if(name==="/health"){res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true,rooms:rooms.size,players:clients.size}));return;}
    const file=name==="/"?"index.html":name.slice(1);
    if(!files.has(file)){res.writeHead(404);res.end("Not found");return;}
    res.writeHead(200,{"Content-Type":file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"text/html",
      "Cache-Control":"no-cache","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
    fs.createReadStream(path.join(__dirname,file)).pipe(res);
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:4096});
  server.on("upgrade",(req,socket,head)=>{
    const allowed=options.origin||process.env.ALLOWED_ORIGIN;
    if(wss.clients.size>=256){socket.end("HTTP/1.1 503 Service Unavailable\r\n\r\n");return;}
    if(req.url!=="/socket"||(allowed&&req.headers.origin!==allowed)){socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,req));
  });
  const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<250000)ws.send(JSON.stringify(data));};
  const sign=p=>{
    const value=Buffer.from(JSON.stringify(p)).toString("base64url");
    return value+"."+crypto.createHmac("sha256",secret).update(value).digest("base64url");
  };
  const verify=token=>{
    if(typeof token!=="string"||token.length>2048)return null;
    const [value,mac,...extra]=token.split(".");if(!value||!mac||extra.length)return null;
    const expected=crypto.createHmac("sha256",secret).update(value).digest("base64url");
    if(mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return null;
    try{
      const p=JSON.parse(Buffer.from(value,"base64url").toString());
      if(typeof p.id!=="string"||!Number.isInteger(p.coins)||p.coins<0||!Array.isArray(p.unlocked)||!SKINS.some(s=>s.id===p.skin))return null;
      return p;
    }catch(_){return null;}
  };
  const publishProfile=c=>send(c.ws,{type:"profile",profile:c.profile,token:sign(c.profile),skins:SKINS});
  const lobby=room=>{
    for(const c of room.members)send(c.ws,{type:"lobby",code:room.code,mode:room.mode,host:room.host,
      members:room.members.map((m,i)=>({id:m.id,username:m.profile.username,team:room.mode==="duo"?Math.floor(i/2):i,skin:m.profile.skin}))});
  };
  const leave=c=>{
    const room=rooms.get(c.room);c.room=null;if(!room)return;
    if(room.world)room.world.disconnect(c.id);
    room.members=room.members.filter(m=>m!==c);
    if(!room.members.length)rooms.delete(room.code);
    else if(!room.world){room.host=room.members[0].id;lobby(room);}
  };
  const join=(c,room)=>{
    if(room.world||room.members.length>=24)throw new Error("That room has already started or is full.");
    if(room.members.some(m=>m.profile.username.toLowerCase()===c.profile.username.toLowerCase()))throw new Error("That username is already in this room. Choose another.");
    leave(c);room.members.push(c);c.room=room.code;lobby(room);
  };
  wss.on("connection",ws=>{
    const c={ws,id:crypto.randomUUID(),profile:null,room:null,rate:0,window:Date.now()};
    let helloTimeout=setTimeout(()=>ws.close(1008,"Identify first"),10000);
    ws.on("message",raw=>{
      try{
        if(Date.now()-c.window>1000){c.window=Date.now();c.rate=0;}
        if(++c.rate>50){ws.close(1008,"Too many messages");return;}
        const data=JSON.parse(raw.toString());if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("Invalid message.");
        if(data.type==="hello"){
          if(c.profile)throw new Error("Already connected.");
          const username=typeof data.username==="string"?data.username.trim():"";
          if(!/^[A-Za-z0-9 _-]{2,16}$/.test(username))throw new Error("Use 2–16 letters, numbers, spaces, underscores or dashes.");
          let p=verify(data.token);
          if(p){
            const cached=profiles.get(p.id);if(cached)p=cached;
            if([...clients.values()].some(other=>other.profile.id===p.id))throw new Error("This profile is already connected in another tab.");
          }else p=profile(username);
          p.username=username;c.profile=p;profiles.set(p.id,p);clients.set(c.id,c);clearTimeout(helloTimeout);helloTimeout=null;
          send(ws,{type:"welcome",id:c.id});publishProfile(c);return;
        }
        if(!c.profile)throw new Error("Connect with a username first.");
        if(data.type==="create"){
          if(rooms.size>=100)throw new Error("The server is full. Try joining an existing room.");
          if(c.room)leave(c);
          let code;do{code=crypto.randomBytes(3).toString("hex").toUpperCase();}while(rooms.has(code));
          const room={code,mode:data.mode==="duo"?"duo":"solo",members:[],host:c.id,world:null};
          rooms.set(code,room);join(c,room);
        }else if(data.type==="join"){
          const room=rooms.get(String(data.code||"").trim().toUpperCase());if(!room)throw new Error("Room not found. Ask the host for its six-character code.");join(c,room);
        }else if(data.type==="leave"){leave(c);send(ws,{type:"left"});}
        else if(data.type==="start"){
          const room=rooms.get(c.room);if(!room||room.host!==c.id)throw new Error("Only the room host can start.");
          if(room.world)throw new Error("Match already started.");
          if(room.mode==="duo"&&(room.members.length<4||room.members.length%2))throw new Error("Duos needs at least four humans and an even player count.");
          if(room.members.length<2)throw new Error("Invite at least one other human before starting.");
          room.world=new World(room.members.map(m=>({id:m.id,username:m.profile.username,skin:m.profile.skin})),room.mode,(id,coins)=>{
            const member=clients.get(id);if(!member)return;
            member.profile.coins+=coins;member.profile.version++;publishProfile(member);
          });
        }else if(data.type==="input"||data.type==="command"){
          const room=rooms.get(c.room),a=room?.world?.actors.find(a=>a.connection===c.id);
          if(data.type==="input")room?.world?.input(a,data);else room?.world?.command(a,data.name,data);
        }else if(data.type==="buy"||data.type==="equip"){
          if(rooms.get(c.room)?.world)throw new Error("Change cosmetics between matches.");
          const skin=SKINS.find(s=>s.id===data.skin);if(!skin)throw new Error("Unknown skin.");
          if(data.type==="buy"&&!c.profile.unlocked.includes(skin.id)){
            if(c.profile.coins<skin.cost)throw new Error("Not enough Storm Coins.");
            c.profile.coins-=skin.cost;c.profile.unlocked.push(skin.id);
          }
          if(!c.profile.unlocked.includes(skin.id))throw new Error("Unlock that skin first.");
          c.profile.skin=skin.id;c.profile.version++;publishProfile(c);const room=rooms.get(c.room);if(room)lobby(room);
        }else throw new Error("Unknown request.");
      }catch(error){send(ws,{type:"error",message:error instanceof SyntaxError?"Invalid JSON.":error.message});}
    });
    ws.on("error",()=>{});
    ws.on("close",()=>{if(helloTimeout)clearTimeout(helloTimeout);leave(c);clients.delete(c.id);});
  });
  let ticks=0,previous=performance.now();
  const timer=setInterval(()=>{
    const now=performance.now(),dt=Math.min(.1,(now-previous)/1000);previous=now;ticks++;
    for(const room of rooms.values()){
      if(!room.world)continue;
      room.world.update(dt);
      if(ticks%3===0){const packet={type:"snapshot",code:room.code,...room.world.snapshot()};for(const c of room.members)send(c.ws,packet);}
    }
  },1000/30);
  const heartbeat=setInterval(()=>{
    for(const ws of wss.clients){if(ws.isAlive===false){ws.terminate();continue;}ws.isAlive=false;ws.ping();}
  },30000);
  wss.on("connection",ws=>{ws.isAlive=true;ws.on("pong",()=>ws.isAlive=true);});
  server.on("close",()=>{clearInterval(timer);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();wss.close();});
  return {server,rooms,clients,verify,sign};
}
if(require.main===module){
  const {server}=createServer();const port=Number(process.env.PORT)||3000;
  server.listen(port,"0.0.0.0",()=>console.log(`Stormfront listening on port ${port}`));
}
module.exports={createServer};
