import json
from pathlib import Path
base=Path('tmp/reports/week3')
source=(base/'fill_hwp.py').read_text(encoding='utf8').replace('week3/content.json','week3/content_detailed.json')
start=source.index('# Replace only');end=source.index("raw=b''.join",start)
source=source[:start]+'''# Each numbered section is a real HWP paragraph; update the cell paragraph count.
out=[]; i=0
while i<len(r):
 if i not in content: out.append(r[i]); i+=1; continue
 end=i+1
 while end<len(r) and r[end][1]>2: end+=1
 paragraphs=content[i].split('\\n')
 assert out[-1][0]==72
 cell=bytearray(out[-1][2]); struct.pack_into('<I',cell,0,len(paragraphs))
 out[-1]=(72,out[-1][1],bytes(cell))
 for n,paragraph in enumerate(paragraphs):
  data=(paragraph+'\\r').encode('utf-16le')
  header=bytearray(r[i][2])
  struct.pack_into('<I',header,0,(0x80000000 if n==len(paragraphs)-1 else 0)|len(data)//2)
  struct.pack_into('<I',header,4,0)
  struct.pack_into('<H',header,12,1)
  struct.pack_into('<H',header,14,0)
  struct.pack_into('<H',header,16,0)
  out.extend([(66,2,bytes(header)),(67,3,data),(68,3,struct.pack('<II',0,10))])
 i=end
''' + source[end:]
source=source.replace('3주차_작성본.hwp','3주차_상세작성본.hwp').replace('3주차_보고서_작성내용.txt','3주차_보고서_상세작성내용.txt')
# Extended HWP record headers are necessary if any payload is 4095 bytes or longer.
source=source.replace("struct.pack('<I',t|(l<<10)|(len(d)<<20))+d", "(struct.pack('<I',t|(l<<10)|(min(len(d),4095)<<20))+(struct.pack('<I',len(d)) if len(d)>=4095 else b''))+d")
(base/'fill_detailed.py').write_text(source,encoding='utf8')
exec(compile(source,str(base/'fill_detailed.py'),'exec'))
