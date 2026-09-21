import json
from pathlib import Path
base=Path('tmp/pdfs/week1')
dest=Path('tmp/reports/week3')
src=(base/'inspect_hwp.py').read_text(encoding='utf8').replace('2026-2학기__10_최정흠_주간학습보고서_1주차.hwp','2026-2학기__010_최정흠_주간학습보고서_3주차.hwp').replace('tmp/pdfs/week1/records.json','tmp/reports/week3/records.json')
(dest/'inspect_hwp.py').write_text(src,encoding='utf8')
source=(base/'fill_hwp.py').read_text(encoding='utf8')
start=source.index('content={'); end=source.index('# Replace only')
source=source[:start]+"content={int(k):v for k,v in json.loads(Path('tmp/reports/week3/content.json').read_text(encoding='utf8')).items()}\nr[39]=(r[39][0],r[39][1],r[39][2].replace('2주차'.encode('utf-16le'),'3주차'.encode('utf-16le')))\n"+source[end:]
source=source.replace('tmp/pdfs/week1/records.json','tmp/reports/week3/records.json').replace("prefix='\\x02汤捯\\x00\\x00\\x00\\x00\\x02' if start==212 else ''","prefix=''")
source=source.replace('2026-2학기__10_최정흠_주간학습보고서_1주차_작성본.hwp','2026-2학기__010_최정흠_주간학습보고서_3주차_작성본.hwp').replace('(1주차)','(3주차)').replace('2026.09.01.~2026.09.07','2026.09.15.~2026.09.21').replace('1주차_보고서_작성내용.txt','3주차_보고서_작성내용.txt')
(dest/'fill_hwp.py').write_text(source,encoding='utf8')
exec(compile(source,str(dest/'fill_hwp.py'),'exec'))
