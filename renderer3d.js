"use strict";
window.StormRenderer = class {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) throw new Error("WebGL is unavailable. Enable hardware acceleration in your browser and reopen the game.");
    const vertex = `
      attribute vec3 position; attribute vec3 normal;
      uniform mat4 model; uniform mat4 view; uniform mat4 projection;
      varying vec3 world; varying vec3 n;
      void main() {
        vec4 p = model * vec4(position, 1.0);
        world = p.xyz; n = normalize(mat3(model) * normal);
        gl_Position = projection * view * p;
      }`;
    const fragment = `
      precision mediump float;
      uniform vec3 color; uniform vec3 eye; uniform float stormRadius; uniform float unlit;
      varying vec3 world; varying vec3 n;
      void main() {
        float light = mix(0.50 + max(0.0, dot(normalize(n), normalize(vec3(-0.4, 1.0, 0.3)))) * 0.5, 1.0, unlit);
        vec3 c = color * light;
        if (length(world.xz - vec2(70.0)) > stormRadius) c = mix(c, vec3(0.49, 0.21, 0.72), 0.6);
        float fog = smoothstep(45.0, 140.0, length(world - eye));
        gl_FragColor = vec4(mix(c, vec3(0.57, 0.76, 0.87), fog), 1.0);
      }`;
    const compile = (type, source) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = this.program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    this.uniforms = {};
    for (const name of ["model", "view", "projection", "color", "eye", "stormRadius", "unlit"]) this.uniforms[name] = gl.getUniformLocation(program, name);
    const vertices = [];
    const faces = [
      [[0,0,1], [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]],
      [[0,0,-1], [[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]],
      [[1,0,0], [[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]]],
      [[-1,0,0], [[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]]],
      [[0,1,0], [[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]],
      [[0,-1,0], [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]]
    ];
    for (const [normal, corners] of faces) for (const i of [0,1,2,0,2,3]) vertices.push(...corners[i], ...normal);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    for (const [name, offset] of [["position", 0], ["normal", 12]]) {
      const a = gl.getAttribLocation(program, name); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 24, offset);
    }
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    this.model = new Float32Array(16);
    this.colors = new Map(); this.drawCalls = 0;
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.gl.viewport(0, 0, w, h);
  }
  begin(eye, yaw, pitch, fov, stormRadius) {
    const gl = this.gl; this.resize(); this.drawCalls = 0;
    gl.clearColor(.57, .76, .87, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const forward = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const right = [Math.cos(yaw), 0, Math.sin(yaw)];
    const up = [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
    const dot = a => a[0] * eye[0] + a[1] * eye[1] + a[2] * eye[2];
    const view = new Float32Array([right[0],up[0],-forward[0],0, right[1],up[1],-forward[1],0,
      right[2],up[2],-forward[2],0, -dot(right),-dot(up),dot(forward),1]);
    const f = 1 / Math.tan(fov / 2), near = .06, far = 230;
    const projection = new Float32Array([f / (this.canvas.width / this.canvas.height),0,0,0,
      0,f,0,0, 0,0,(far + near) / (near - far),-1, 0,0,2 * far * near / (near - far),0]);
    gl.uniformMatrix4fv(this.uniforms.view, false, view); gl.uniformMatrix4fv(this.uniforms.projection, false, projection);
    gl.uniform3fv(this.uniforms.eye, eye); gl.uniform1f(this.uniforms.stormRadius, stormRadius);
    this.eye = eye; this.yaw = yaw; this.pitch = pitch; this.fov = fov;
  }
  box(x, y, z, w, h, d, color, yaw = 0, unlit = false) {
    const gl = this.gl, m = this.model, c = Math.cos(yaw), s = Math.sin(yaw);
    m.set([c*w,0,-s*w,0, 0,h,0,0, s*d,0,c*d,0, x,y,z,1]);
    let rgb = this.colors.get(color);
    if (!rgb) {
      rgb = [parseInt(color.slice(1,3),16)/255, parseInt(color.slice(3,5),16)/255, parseInt(color.slice(5,7),16)/255];
      this.colors.set(color, rgb);
    }
    gl.uniformMatrix4fv(this.uniforms.model, false, m); gl.uniform3fv(this.uniforms.color, rgb);
    gl.uniform1f(this.uniforms.unlit, unlit ? 1 : 0); gl.drawArrays(gl.TRIANGLES, 0, 36); this.drawCalls++;
  }
  part(x, y, z, yaw, ox, oy, oz, w, h, d, color) {
    this.box(x + ox * Math.cos(yaw) + oz * Math.sin(yaw), y + oy,
      z - ox * Math.sin(yaw) + oz * Math.cos(yaw), w, h, d, color, yaw);
  }
  gun(x, y, z, yaw, weapon, held = false) {
    const shape = weapon.shape, tier = StormWeapons.rarities[weapon.rarity].color;
    const lengths = { pistol: .32, smg: .48, shotgun: .85, sniper: 1.1, lmg: .85, marksman: .92, burst: .72, rifle: .72 };
    const length = lengths[shape], scale = held ? 1 : 1.1;
    const part = (ox, oy, oz, w, h, d, color) => this.part(x, y, z, yaw, ox*scale, oy*scale, oz*scale, w*scale, h*scale, d*scale, color);
    part(0, 0, 0, .13, .15, length * .6, "#263547");
    part(0, -.12, length * .18, .10, .22, .12, "#202936");
    part(0, .085, 0, .14, .035, length * .4, tier);
    part(0, 0, -length * .44, .065, .065, length * .35, "#596773");
    if (shape !== "pistol") part(0, -.02, length * .4, .14, .16, .22, "#86674f");
    if (shape === "sniper" || shape === "marksman") part(0, .17, -.04, .08, .09, .24, "#1c2936");
    if (shape === "lmg") part(.06, -.13, -.06, .2, .19, .22, tier);
    if (shape === "shotgun") part(0, -.05, -length * .2, .16, .09, .25, "#be9161");
    if (shape === "burst") part(0, .13, -.13, .08, .055, .07, tier);
  }
  person(a, time, friendly) {
    const yaw = -a.yaw, skin = a.skin, shirt = a.color, pants = "#26364f";
    const stride = a.moving ? Math.sin(time * 10 + a.id) * .17 : 0;
    const p = (...args) => this.part(a.x, a.y, a.z, yaw, ...args);
    p(0, 1.08, 0, .48, .65, .30, shirt); p(0, 1.14, -.165, .30, .40, .08, "#324a58");
    p(0, 1.66, 0, .34, .38, .34, skin); p(0, 1.86, .02, .36, .10, .36, "#382d29");
    p(-.08, 1.70, -.176, .045, .035, .015, "#172333"); p(.08, 1.70, -.176, .045, .035, .015, "#172333");
    p(0, 1.59, -.18, .09, .025, .02, "#9c604e");
    p(-.14, .43, stride, .20, .75, .24, pants); p(.14, .43, -stride, .20, .75, .24, pants);
    p(-.14, .08, stride-.04, .23, .16, .34, "#1d2733"); p(.14, .08, -stride-.04, .23, .16, .34, "#1d2733");
    p(-.32, 1.08, -.17, .17, .43, .22, shirt); p(.32, 1.08, -.17, .17, .43, .22, shirt);
    p(-.25, .95, -.39, .17, .14, .37, skin); p(.25, .95, -.39, .17, .14, .37, skin);
    this.gun(a.x + Math.sin(a.yaw)*.40, a.y+1.03, a.z - Math.cos(a.yaw)*.40, yaw, a.weapons[a.slot], true);
    if (friendly) {
      this.box(a.x, a.y+2.3, a.z, .18, .18, .18, "#65efff", time, true);
      this.box(a.x, a.y+2.08, a.z, .65*a.hp/100, .055, .06, "#76df76", 0, true);
    }
  }
  project(x,y,z) {
    const dx=x-this.eye[0],dy=y-this.eye[1],dz=z-this.eye[2],yaw=this.yaw,pitch=this.pitch;
    const right=dx*Math.cos(yaw)+dz*Math.sin(yaw);
    const up=-dx*Math.sin(yaw)*Math.sin(pitch)+dy*Math.cos(pitch)+dz*Math.cos(yaw)*Math.sin(pitch);
    const depth=dx*Math.sin(yaw)*Math.cos(pitch)+dy*Math.sin(pitch)-dz*Math.cos(yaw)*Math.cos(pitch);
    if(depth<.1)return null;
    const scale=innerHeight/(2*Math.tan(this.fov/2)*depth);
    return {x:innerWidth/2+right*scale,y:innerHeight/2-up*scale};
  }
  viewGun(weapon, kick, time, moving, aiming, reload) {
    const gl = this.gl;
    gl.clear(gl.DEPTH_BUFFER_BIT);
    // Render hands in camera space so they follow pitch and stay stable while zooming.
    gl.uniformMatrix4fv(this.uniforms.view, false, new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]));
    const f = 1 / Math.tan(.65), aspect = this.canvas.width / this.canvas.height;
    gl.uniformMatrix4fv(this.uniforms.projection, false, new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,-1.001,-1,0,0,-.12,0]));
    gl.uniform3fv(this.uniforms.eye, [0,0,0]); gl.uniform1f(this.uniforms.stormRadius, 10000);
    const right = aiming ? .02 : .24, front = .48 - kick*.08, bob = moving ? Math.sin(time*11)*.012 : 0;
    const gx = right, gz = -front, gy = -(aiming ? .13 : .24) + bob - (reload ? .18 : 0);
    this.gun(gx, gy, gz, 0, weapon, true);
    this.part(gx,gy,gz,0,-.10,-.12,.15,.13,.13,.38,"#d69a74");
    this.part(gx,gy,gz,0,.13,-.16,.24,.13,.13,.38,"#d69a74");
    if (kick > .65) this.box(gx,gy,gz-.48,.11,.11,.11,"#ffe393",time,true);
  }
};
