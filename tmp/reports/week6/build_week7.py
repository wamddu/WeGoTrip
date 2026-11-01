from pathlib import Path
import json,struct,types,contextlib,io
base=Path('tmp/reports/week6')
content={
207:'여행 멤버들이 앱 안에서 대화하고 사진과 의견을 공유할 수 있도록 채팅 기능을 구현한다. 중요한 전달 사항은 여행 공지로 따로 관리하고, 여행과 파티의 참여 여부에 따라 접근 권한을 구분한다.',
219:'1. 채팅과 사진 공유: 전체 채팅과 파티별 채팅을 구분하고, 최신 메시지부터 이전 대화를 추가로 조회하도록 하였다. WebSocket으로 변경을 알리고 HTTP로 최신 내용을 가져오며, 연결 중단 후에는 재접속과 주기적 조회로 놓친 변경을 확인하도록 구성하였다. 사진은 여러 장 선택해 순서대로 전송하고 이미지 메시지만 모아 볼 수 있도록 하였다. 백엔드가 사진을 Cloudinary에 업로드한 뒤, 반환된 URL과 식별자를 DB에 저장하고 채팅 메시지에 연결하였다.\n2. 투표: 단일·복수 선택과 여행 장소 연결, 자동·수동 마감을 구현하였다. 같은 항목을 다시 누르면 선택을 취소하고, 동일한 항목에 중복 투표하지 못하도록 처리하였다. 마감 시각은 서버에서 판단하며, 장소가 삭제되어도 투표 생성 당시 이름과 주소는 남도록 하였다.\n3. 여행 공지와 권한: 방장만 공지를 작성·수정·삭제·고정하고, 여행 멤버는 모두 조회하도록 하였다. 공지는 서버 DB에 저장하며 수정 버전을 비교해 오래된 내용으로 덮어쓰지 않도록 처리하였다. 채팅과 공지의 새 글 알림을 연결하고, 파티 채팅은 방장이라도 해당 파티 멤버가 아니면 접근하지 못하도록 하였다.',
228:'채팅과 공지의 화면, API, DB 저장 흐름을 연결하며 작업하였다. 기능별 공식 문서를 참고하고, 멤버와 비멤버의 접근, 투표 선택과 취소, 공지 변경처럼 조건에 따라 결과가 달라지는 경우를 나누어 확인하였다. 자동 테스트와 타입 검사, 플랫폼별 번들 생성을 통해 구현 내용을 점검하였다.',
241:'대화 중 사진을 공유하고 투표로 의견을 모으며, 중요한 내용은 공지로 남기는 흐름을 구현하였다. 파일은 Cloudinary에 저장하고 DB에는 참조 정보를 남기는 구조를 이해하였다. 실시간 이벤트를 받는 것뿐 아니라 연결이 끊겼을 때 데이터를 다시 맞추는 과정도 필요하다는 점을 배웠다. 핵심 기능 구현은 마쳤으며, 실제 기기의 푸시 알림 수신과 화면 이동은 추가 확인이 필요하다.',
254:'React Native·Spring Boot 공식 문서\nCloudinary 공식 문서\nFirebase Cloud Messaging 공식 문서\nMySQL·Git 공식 문서',
263:'실제 기기에서 채팅과 공지 알림의 수신 및 화면 이동을 확인할 계획이다. 앱이 실행 중이거나 종료된 경우를 나누어 살펴보고, 네트워크 재연결과 권한 변경 이후의 동작도 점검하겠다. 확인 과정에서 발견한 문제를 수정해 공유 기능을 안정화하겠다.'}
# Use the compact copy of the same form to avoid retaining old screenshot row heights.
h=types.ModuleType('week7_source')
reader=(base/'inspect_hwp.py').read_text(encoding='utf8').replace("other_documents/2026-2학기__010_최정흠_주간학습보고서_6주차.hwp","output/reports/2026-2학기__010_최정흠_주간학습보고서_6주차_완성본.hwp")
with contextlib.redirect_stdout(io.StringIO()):exec(reader,h.__dict__)
records=json.loads((base/'records.json').read_text())
starts=[]
for prefix in ['여행 멤버의 지출','1. 지출 기록','화면 입력부터','지출 등록부터','Git 공식','여행방 멤버들이']:
 idx=next(i for i,(t,l,d) in enumerate(records) if t==67 and bytes.fromhex(d).decode('utf-16le').startswith(prefix))
 starts.append(idx-1)
content=dict(zip(starts,content.values()))
(base/'week7_content.json').write_text(json.dumps(content,ensure_ascii=False),encoding='utf8')
src=(base/'fill_final.py').read_text(encoding='utf8')
src=src.replace(' import inspect_hwp as h',' pass # source loaded above')
src=src.replace("Path('tmp/reports/week6/content.json')","Path('tmp/reports/week6/week7_content.json')")
insert='''
date_idx=next(i for i,(t,l,d) in enumerate(r) if t==67 and '2026년' in d.decode('utf-16le'))
for idx,old,new in [(37,'6주차','7주차'),(127,'2026.10.6.~2026.10.12','2026.10.13.~2026.10.19'),(148,'6','7'),(date_idx,'13일','20일')]:
 t,l,d=r[idx]; r[idx]=(t,l,d.replace(old.encode('utf-16le'),new.encode('utf-16le')))
 j=idx-1
 while r[j][0]!=66:j-=1
 hdr=bytearray(r[j][2]); count=struct.unpack_from('<I',hdr)[0];struct.pack_into('<I',hdr,0,(count&0x80000000)|len(r[idx][2])//2);r[j]=(r[j][0],r[j][1],bytes(hdr))
'''
src=src.replace('# Each numbered',insert+'\n# Each numbered')
src=src.replace('while end<len(r) and r[end][1]>2: end+=1','while end<len(r) and not (r[end][0]==72 and r[end][1]==2) and r[end][1]>=2: end+=1')
src=src.replace('6주차_완성본.hwp','7주차_완성본.hwp').replace('6주차_보고서_작성내용.txt','7주차_보고서_작성내용.txt').replace('보고서 (6주차)','보고서 (7주차)').replace('2026.10.6.~2026.10.12','2026.10.13.~2026.10.19',1) if False else src
# Apply metadata replacements only after the inserted patch, preserving its old-value matches.
src=src.replace("['2026-2학기 세종창의학기제 주간학습보고서 (6주차)','10조 최정흠 / 22011683 / 2026.10.6.~2026.10.12']","['2026-2학기 세종창의학기제 주간학습보고서 (7주차)','10조 최정흠 / 22011683 / 2026.10.13.~2026.10.19']")
src=src.replace('6주차_완성본.hwp','7주차_완성본.hwp').replace('6주차_보고서_작성내용.txt','7주차_보고서_작성내용.txt')
exec(compile(src,'week7_builder','exec'))
