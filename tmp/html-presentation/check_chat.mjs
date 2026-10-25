import { chromium } from 'file:///C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
const root='C:/Programings/2026_2_창의학기제';
const dest=root+'/tmp/html-presentation/chat-review';await fs.mkdir(dest,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(pathToFileURL(root+'/output/presentations/WeGoTrip_Chat_Notice/WeGoTrip_채팅_투표_공지.html').href);
await page.evaluate(()=>document.fonts.ready);
await page.keyboard.press('ArrowRight');const nav=await page.locator('#count').textContent();
await page.keyboard.press('ArrowRight');await page.locator('.active img').click();const zoom=await page.locator('dialog').evaluate(d=>d.open);await page.keyboard.press('Escape');
await page.emulateMedia({media:'print'});
const checks=await page.evaluate(()=>[...document.querySelectorAll('.slide')].map((s,i)=>{
const r=s.getBoundingClientRect();return {slide:i+1,overflow:[...s.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1||b.bottom>r.bottom+1||b.top<r.top-1}).map(e=>e.tagName+':'+e.textContent.slice(0,50)),images:[...s.querySelectorAll('img')].map(e=>({source:e.dataset.source,loaded:e.complete&&e.naturalWidth>0}))};}));
for(let i=0;i<14;i++)await page.locator('.slide').nth(i).screenshot({path:dest+'/slide-'+String(i+1).padStart(2,'0')+'.png'});
await fs.writeFile(dest+'/validation.json',JSON.stringify({checks,nav,zoom,errors},null,2));console.log(JSON.stringify({checks,nav,zoom,errors}));await browser.close();
