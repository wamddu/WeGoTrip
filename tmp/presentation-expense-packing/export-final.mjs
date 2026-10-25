import fs from 'node:fs/promises';
import path from 'node:path';
import {FileBlob,PresentationFile} from '@oai/artifact-tool';
const ROOT='C:/Programings/2026_2_창의학기제';
const BUILD=path.join(ROOT,'tmp/presentation-expense-packing');
const finalPath=path.join(ROOT,'output/presentations/WeGoTrip_지출정산_준비물_발표자료.pptx');
const deck=await PresentationFile.importPptx(await FileBlob.load(finalPath));
await fs.mkdir(path.join(BUILD,'final-render'),{recursive:true});
for(const [i,s] of deck.slides.items.entries()) {
 const png=await deck.export({slide:s,format:'png',scale:1});
 await fs.writeFile(path.join(BUILD,'final-render',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
 console.log(`Final render ${i+1}`);
}
console.log('Final PPTX rendered. PDF is exported by PowerPoint using export-native-pdf.ps1.');
