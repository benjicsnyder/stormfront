"use strict";
const {execFileSync}=require("node:child_process");
const git=(args,input)=>execFileSync("git",args,{encoding:"utf8",input});
if(git(["branch","--show-current"]).trim()!=="main")throw new Error("Publish from the main branch.");
const files=["config.js","game.js","index.html","online.js","renderer3d.js","style.css","weapons.js"];
// Pass exact LF-delimited bytes to Git; PowerShell piping adds CR to tree filenames.
const entries=git(["ls-tree","HEAD","--",...files]);
const names=entries.trimEnd().split("\n").map(line=>line.split("\t")[1]);
if(names.length!==files.length||names.some(name=>!files.includes(name)))throw new Error("Public client tree is incomplete.");
const tree=git(["mktree"],entries).trim();
let parent;
try{parent=git(["rev-parse","--verify","refs/heads/gh-pages"]).trim();}catch(_){}
if(parent&&git(["rev-parse",parent+"^{tree}"]).trim()===tree){console.log("Client files are already published.");process.exit(0);}
const args=["commit-tree",tree];if(parent)args.push("-p",parent);
const commit=git(args,"Publish public browser game\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>\n").trim();
git(["update-ref","refs/heads/gh-pages",commit,...(parent?[parent]:[])]);
process.stdout.write(git(["push","origin","gh-pages"]));
console.log("Published only public client files to gh-pages.");
