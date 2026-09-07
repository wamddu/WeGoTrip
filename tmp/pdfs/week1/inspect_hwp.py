import struct,zlib,json
from pathlib import Path
src=Path('other_documents/2026-2학기__10_최정흠_주간학습보고서_1주차.hwp')
b=src.read_bytes(); ss=1<<struct.unpack_from('<H',b,30)[0]
def sector(n): return b[(n+1)*ss:(n+2)*ss]
fat=[]
for n in struct.unpack_from('<109I',b,76):
 if n<0xfffffffa: fat.extend(struct.unpack('<%dI'%(ss//4),sector(n)))
def chain(n,table=fat):
 result=[]
 while n<0xfffffffa:
  result.append(n); n=table[n]
 return result
def stream(n): return b''.join(sector(i) for i in chain(n))
dirs=stream(struct.unpack_from('<I',b,48)[0]); entries=[]
for off in range(0,len(dirs),128):
 d=dirs[off:off+128]; ln=struct.unpack_from('<H',d,64)[0]
 if ln: entries.append({'name':d[:ln-2].decode('utf-16le'),'type':d[66],'start':struct.unpack_from('<I',d,116)[0],'size':struct.unpack_from('<Q',d,120)[0],'off':off})
root=entries[0]; mini=stream(root['start']); mf=stream(struct.unpack_from('<I',b,60)[0]); mft=struct.unpack('<%dI'%(len(mf)//4),mf)
def read(e):
 if e['size']<4096: return b''.join(mini[n*64:(n+1)*64] for n in chain(e['start'],mft))[:e['size']]
 return stream(e['start'])[:e['size']]
for e in entries:
 print(e)
 if e['name']=='PrvText': print(read(e).decode('utf-16le'))
 if e['name'].startswith('Section'):
  raw=zlib.decompress(read(e),-15); records=[]; p=0
  while p<len(raw):
   h=struct.unpack_from('<I',raw,p)[0]; p+=4; tag=h&1023; lev=(h>>10)&1023; sz=h>>20
   if sz==4095: sz=struct.unpack_from('<I',raw,p)[0]; p+=4
   payload=raw[p:p+sz];p+=sz;records.append((tag,lev,payload))
  for i,(tag,lev,data) in enumerate(records):
   if tag==67: print('TEXT',i,lev,repr(data.decode('utf-16le')))
  Path('tmp/pdfs/week1/records.json').write_text(json.dumps([(t,l,d.hex()) for t,l,d in records]),encoding='utf8')
