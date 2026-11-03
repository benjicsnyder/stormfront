"use strict";
window.StormOnline = (() => {
  const $=id=>document.getElementById(id);
  const saved=key=>{try{return localStorage.getItem(key)||"";}catch(_){return "";}};
  const save=(key,value)=>{try{localStorage.setItem(key,value);}catch(_){}};
  const net={socket:null,id:null,profile:null,skins:[],onSnapshot:()=>{},onLobby:()=>{},onLeft:()=>{},onDisconnect:()=>{},pending:null,code:null};
  $("username").value=saved("storm-username");
  $("serverUrl").value=window.StormConfig.serverUrl||saved("storm-server")||(location.protocol!=="file:"&&!location.hostname.endsWith("github.io")?location.origin:"");
  function status(text){
    for(const id of ["netStatus","lobbyStatus","shopStatus"])$(id).textContent=text;
  }
  net.send=data=>{
    if(net.socket?.readyState===WebSocket.OPEN)net.socket.send(JSON.stringify(data));
  };
  function showShop(){
    if(!net.profile)return;
    $("coinBalance").textContent=`${net.profile.username} · ${net.profile.coins} STORM COINS`;
    $("skinList").replaceChildren();
    for(const skin of net.skins){
      const card=document.createElement("div");card.className="skin-card";
      const figure=document.createElement("div");figure.className="skin-figure";
      figure.style.setProperty("--shirt",skin.color);figure.style.setProperty("--skin",skin.skin);
      for(const part of ["head","body","left-arm","right-arm","left-leg","right-leg"]){const div=document.createElement("i");div.className=part;figure.append(div);}
      const name=document.createElement("strong");name.textContent=skin.name;
      const button=document.createElement("button"),owned=net.profile.unlocked.includes(skin.id),equipped=net.profile.skin===skin.id;
      button.textContent=equipped?"EQUIPPED":owned?"EQUIP":`${skin.cost} COINS`;
      button.disabled=equipped||(!owned&&net.profile.coins<skin.cost);
      button.onclick=()=>net.send({type:owned?"equip":"buy",skin:skin.id});
      card.append(figure,name,button);$("skinList").append(card);
    }
    $("shop").hidden=false;
  }
  net.connect=action=>{
    const username=$("username").value.trim(),endpoint=$("serverUrl").value.trim();
    if(!/^[A-Za-z0-9 _-]{2,16}$/.test(username)){status("Choose a username: 2–16 letters, numbers, spaces, underscores or dashes.");return;}
    let url;
    try{
      url=new URL(endpoint);
      if(!["https:","http:","wss:","ws:"].includes(url.protocol))throw new Error();
      url.protocol=url.protocol==="https:"||url.protocol==="wss:"?"wss:":"ws:";url.pathname="/socket";url.search="";url.hash="";
      if(location.protocol==="https:"&&url.protocol!=="wss:"){status("A public HTTPS game requires an HTTPS / WSS server URL.");return;}
    }catch(_){status("Enter your multiplayer server URL first (for example https://your-server.onrender.com).");return;}
    save("storm-username",username);save("storm-server",endpoint);
    if(net.socket?.readyState===WebSocket.OPEN&&net.profile&&net.profile.username===username){
      if(action.type==="shop")showShop();else net.send(action);return;
    }
    if(net.socket)net.socket.close();
    net.profile=null;net.pending=action;status("Connecting… Free Render servers may take a minute to wake up.");
    const ws=net.socket=new WebSocket(url.href);
    ws.onopen=()=>net.send({type:"hello",username,token:saved("storm-profile")});
    ws.onmessage=e=>{
      let data;try{data=JSON.parse(e.data);}catch(_){return;}
      if(data.type==="welcome")net.id=data.id;
      if(data.type==="profile"){
        net.profile=data.profile;net.skins=data.skins;save("storm-profile",data.token);
        if(!$("shop").hidden)showShop();
        if(net.pending){const pending=net.pending;net.pending=null;if(pending.type==="shop")showShop();else net.send(pending);}
        status(`${net.profile.username} connected · ${net.profile.coins} Storm Coins`);
      }
      if(data.type==="lobby"){
        net.code=data.code;$("lobbyCode").textContent=data.code;
        $("lobbyInfo").textContent=`Share this code and the same server URL. ${data.mode==="duo"?"DUOS — at least 4 humans, paired in join order.":"SOLO — at least 2 humans."}`;
        $("lobbyMembers").replaceChildren();
        data.members.forEach(m=>{
          const row=document.createElement("div");row.className="lobby-member";
          row.textContent=`${m.username}${m.id===net.id?" (you)":""} · ${data.mode==="duo"?"Team "+(m.team+1):"Solo"}${m.id===data.host?" · HOST":""}`;
          $("lobbyMembers").append(row);
        });
        $("startMatch").hidden=data.host!==net.id;
        $("lobbyStatus").textContent=`${data.members.length} / 24 humans · Waiting for the host`;
        net.onLobby(data);
      }
      if(data.type==="snapshot")net.onSnapshot(data);
      if(data.type==="left"){net.code=null;net.onLeft();}
      if(data.type==="error")status(data.message);
    };
    ws.onerror=()=>status("Cannot reach the server. Check its URL and Render deployment status.");
    ws.onclose=()=>{
      if(net.socket!==ws)return;
      net.id=null;net.code=null;net.pending=null;status("Disconnected. Rejoin a room to play; disconnected fighters are eliminated.");
      net.onDisconnect();
    };
  };
  net.create=()=>net.connect({type:"create",mode:$("mode").value.includes("duo")?"duo":"solo"});
  $("joinRoom").onclick=()=>net.connect({type:"join",code:$("roomCode").value});
  $("startMatch").onclick=()=>net.send({type:"start"});
  $("leaveRoom").onclick=()=>net.send({type:"leave"});
  $("shopButton").onclick=()=>net.connect({type:"shop"});
  $("closeShop").onclick=()=>{$("shop").hidden=true;};
  return net;
})();
