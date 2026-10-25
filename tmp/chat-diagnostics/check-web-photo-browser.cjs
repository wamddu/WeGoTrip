const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const ts = require("../../frontend/node_modules/typescript");
const moduleSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../frontend/src/data/chat-photo-upload.web.ts"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const page = String.raw`<!doctype html><html><head><title>Local photo compression check</title></head><body><img hidden src="/hold.png"><pre id="result">running</pre><script type="module">
import { uploadPhoto } from "/upload.mjs";
const limit = 8 * 1024 * 1024;
const results = [];
function assert(condition, message) { if (!condition) throw new Error(message); }
const encode = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.95));
function pad(blob) { return new Blob([blob, new Uint8Array(Math.max(0, limit + 1 - blob.size))], { type: blob.type }); }
async function send(file, filename) {
  let uploaded;
  await uploadPhoto({ id: filename, uri: "unused-preview", file, filename }, { upload: async (form) => { uploaded = form.get("file");return { id: "local-test" }; } });
  assert(uploaded && uploaded.size <= limit, "Oversized upload escaped compression");return uploaded;
}
async function pixels(file) {
  const bitmap = await createImageBitmap(file);const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;canvas.height = bitmap.height;const context = canvas.getContext("2d");context.drawImage(bitmap, 0, 0);
  const sample = (x, y) => [...context.getImageData(x, y, 1, 1).data];
  const data = { width: bitmap.width, height: bitmap.height, top: sample(Math.floor(bitmap.width / 2), 10), bottom: sample(Math.floor(bitmap.width / 2), bitmap.height - 10), corner: sample(0, 0), center: sample(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2)) };
  bitmap.close();canvas.width = 0;canvas.height = 0;return data;
}
try {
  const canvas = document.createElement("canvas");canvas.width = 3000;canvas.height = 2000;const context = canvas.getContext("2d");
  context.fillStyle = "red";context.fillRect(0, 0, 1500, 2000);context.fillStyle = "blue";context.fillRect(1500, 0, 1500, 2000);
  const jpeg = await encode(canvas, "image/jpeg");
  const original = await send(jpeg, "small.jpg");assert(original.size === jpeg.size && original.type === jpeg.type, "Small original changed");
  results.push({ test: "small original", bytes: original.size });
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  const exif = new Uint8Array([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
  const rotated = pad(new Blob([bytes.subarray(0, 2), exif, bytes.subarray(2)], { type: "image/jpeg" }));
  const portrait = await send(rotated, "portrait.jpeg");const oriented = await pixels(portrait);
  assert(oriented.width === 1707 && oriented.height === 2560, "EXIF dimensions or aspect ratio changed");
  assert(oriented.top[0] > 200 && oriented.top[2] < 50 && oriented.bottom[2] > 200 && oriented.bottom[0] < 50, "EXIF pixel orientation changed");
  assert(portrait.name === "portrait.jpg", "JPEG filename mismatch");
  results.push({ test: "large EXIF portrait", inputBytes: rotated.size, outputBytes: portrait.size, ...oriented });
  context.clearRect(0, 0, 3000, 2000);context.fillStyle = "rgba(0,200,0,0.5)";context.fillRect(100, 100, 2800, 1800);
  const transparent = pad(await encode(canvas, "image/png"));
  const alpha = await send(transparent, "transparent.png");const alphaPixels = await pixels(alpha);
  assert(alphaPixels.corner[3] === 0 && Math.abs(alphaPixels.center[3] - 128) <= 2, "PNG transparency lost");
  assert(alpha.type === "image/webp" && alpha.name === "transparent.webp", "WebP filename mismatch");
  results.push({ test: "large transparent PNG", inputBytes: transparent.size, outputBytes: alpha.size, ...alphaPixels });
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) { return originalToBlob.call(this, callback, type === "image/webp" ? "image/png" : type, quality); };
  try {
    const fallback = await send(transparent, "fallback.png");const alphaFallback = await pixels(fallback);
    assert(fallback.type === "image/png" && fallback.name === "fallback.png" && alphaFallback.corner[3] === 0, "PNG encoder fallback lost alpha or extension");
    results.push({ test: "PNG encoder fallback", outputBytes: fallback.size });
  } finally { HTMLCanvasElement.prototype.toBlob = originalToBlob; }
  const originalBitmap = window.createImageBitmap;const create = URL.createObjectURL;const revoke = URL.revokeObjectURL;
  const created = [], revoked = [];
  URL.createObjectURL = (blob) => { const uri = create.call(URL, blob);created.push(uri);return uri; };
  URL.revokeObjectURL = (uri) => { revoked.push(uri);return revoke.call(URL, uri); };
  let imgFallback;
  try { window.createImageBitmap = undefined;imgFallback = await send(rotated, "image-fallback.jpeg"); }
  finally { window.createImageBitmap = originalBitmap;URL.createObjectURL = create;URL.revokeObjectURL = revoke; }
  const imgPixels = await pixels(imgFallback);
  assert(imgPixels.width === 1707 && imgPixels.height === 2560 && imgPixels.top[0] > 200, "Image element orientation fallback failed");
  assert(created.length === 1 && revoked[0] === created[0], "Temporary image URL not released");
  results.push({ test: "image decode fallback", outputBytes: imgFallback.size, urlsReleased: revoked.length });
  canvas.width = 4096;canvas.height = 3072;
  const noise = context.createImageData(canvas.width, canvas.height);let random = 123456789;
  for (let offset = 0; offset < noise.data.length; offset += 4) {
    random ^= random << 13;random ^= random >>> 17;random ^= random << 5;
    noise.data[offset] = random & 255;noise.data[offset + 1] = (random >>> 8) & 255;noise.data[offset + 2] = (random >>> 16) & 255;noise.data[offset + 3] = 255;
  }
  context.putImageData(noise, 0, 0);
  const noisyJpeg = await encode(canvas, "image/jpeg");assert(noisyJpeg.size > limit, "Noise JPEG fixture is too small");
  const noisyUpload = await send(noisyJpeg, "noisy.jpeg");const noisyPixels = await pixels(noisyUpload);
  assert(noisyPixels.width === 2560 && noisyPixels.height === 1920, "Large JPEG aspect ratio changed");
  results.push({ test: "large encoded photo without padding", inputBytes: noisyJpeg.size, outputBytes: noisyUpload.size, width: noisyPixels.width, height: noisyPixels.height });
  canvas.width = 0;canvas.height = 0;
  document.getElementById("result").textContent = "PASS";
  await fetch("/result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passed: true, results }) });
} catch (error) {
  document.getElementById("result").textContent = "FAIL: " + error.message;
  await fetch("/result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passed: false, error: error.message, results }) });
}
</script></body></html>`;
let held, result, browser;
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT8sAAAAASUVORK5CYII=", "base64");
const server = http.createServer((request, response) => {
  if (request.url === "/upload.mjs") { response.writeHead(200, { "Content-Type": "text/javascript" });response.end(moduleSource); }
  else if (request.url === "/hold.png") { if (result) { response.writeHead(200, { "Content-Type": "image/png" });response.end(pixel); }else held = response; }
  else if (request.url === "/result" && request.method === "POST") {
    let body = "";request.on("data", (chunk) => { body += chunk; });request.on("end", () => {
      result = JSON.parse(body);fs.writeFileSync(path.join(__dirname, "web-photo-browser-result.json"), JSON.stringify(result, null, 2));response.end("ok");
      if (held) { held.writeHead(200, { "Content-Type": "image/png" });held.end(pixel); }
    });
  } else if (request.url === "/") { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });response.end(page); }
  else { response.writeHead(404);response.end(); }
});
server.listen(0, "127.0.0.1", () => {
  browser = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless", "--disable-gpu", "--disable-background-networking", "--disable-extensions", "--disable-component-update", "--disable-sync", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${path.join(__dirname, "web-photo-chrome-profile")}`, "--dump-dom", `http://127.0.0.1:${server.address().port}/`], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let diagnostics = "";browser.stderr.on("data", (chunk) => { diagnostics = (diagnostics + chunk).slice(-2000); });
  const timeout = setTimeout(() => { browser.kill();server.closeAllConnections();server.close();console.log(JSON.stringify({ passed: false, error: "Browser test timed out", diagnostics }));process.exitCode = 1; }, 60000);
  browser.on("error", (error) => { clearTimeout(timeout);server.closeAllConnections();server.close();console.log(error.message);process.exitCode = 1; });
  browser.on("close", () => { clearTimeout(timeout);server.closeAllConnections();server.close();console.log(JSON.stringify(result ?? { passed: false, error: "No browser result", diagnostics }));process.exitCode = result?.passed ? 0 : 1; });
});
