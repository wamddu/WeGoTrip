from pathlib import Path
import xml.etree.ElementTree as E,json,copy
base=Path('tmp/reports/week6');out=Path('output/reports')
r=E.parse(out/'2026-2학기__010_최정흠_주간학습보고서_6주차_완성본.hml').getroot()
values=list(json.loads((base/'week7_content.json').read_text(encoding='utf8')).values())
prefixes=['여행 멤버의 지출','1. 지출 기록','화면 입력부터','지출 등록부터','Git 공식','여행방 멤버들이']
for prefix,value in zip(prefixes,values):
 cell=next(x for x in r.iter('CELL') if ''.join(x.itertext()).startswith(prefix))
 pl=cell.find('PARALIST');p0=copy.deepcopy(pl.find('P'));shape=p0.find('TEXT').get('CharShape')
 for x in list(pl):pl.remove(x)
 for line in value.split('\n'):
  p=E.SubElement(pl,'P',dict(p0.attrib));t=E.SubElement(p,'TEXT',{'CharShape':shape});E.SubElement(t,'CHAR').text=line
for c in r.iter('CHAR'):
 if c.text:
  c.text=c.text.replace('6주차','7주차').replace('2026.10.6.~2026.10.12','2026.10.13.~2026.10.19').replace('2026년     10월     13일','2026년     10월     20일')
# Week cell is distinct from the six-hour learning-time field.
cells=list(r.iter('CELL'))
for i,c in enumerate(cells):
 if ''.join(c.itertext()).strip()=='학습주차':
  for ch in cells[i+1].iter('CHAR'):
   if ch.text=='6':ch.text='7'
temp=base/'week7-base.hml';E.ElementTree(r).write(temp,encoding='utf-8',xml_declaration=True)
helper=(base/'add_images.py').read_text(encoding='utf8').split("title('학습 결과 1")[0]
helper=helper.replace("next(out.glob('*6주차_완성본.hml'))","Path('tmp/reports/week6/week7-base.hml')").replace('output/presentations/WeGoTrip_HTML_PDF/WeGoTrip_정산_준비물.html','output/presentations/WeGoTrip_Chat_Notice/WeGoTrip_채팅_투표_공지.html').replace('assert len(assets)==11','assert len(assets)==9')
exec(compile(helper,'image_helpers','exec'))
title('학습 결과 1  여행 전체와 파티별 채팅')
para('여행 멤버들이 앱 안에서 대화할 수 있도록 전체 채팅과 파티별 채팅을 구성하였다. 상단 선택 영역에서 채팅방을 바꾸며, 텍스트와 사진, 투표를 같은 대화 흐름에서 확인할 수 있다.')
t=para(style=picture_style);picture(t,'채팅 화면.png',27000,47000)
caption('그림 1  텍스트와 사진 및 투표를 함께 표시한 채팅 화면')
para('메시지는 최신 50개부터 불러오고 이전 대화를 추가로 조회한다. WebSocket으로 변경을 전달한 뒤 인증된 HTTP API에서 최신 내용을 가져오도록 하였다. 파티 채팅은 해당 파티 멤버만 접근할 수 있도록 서버에서 검사한다.')
title('학습 결과 2  Cloudinary 이미지 업로드')
para('사진 선택 패널에서 여러 장을 고르고 선택한 순서대로 전송하도록 하였다. 이미지 필터를 켜면 현재 채팅방의 사진만 모아서 볼 수 있고, 사진을 누르면 확대하여 확인할 수 있다.')
pair('사진 선택 화면.png','이미지만 필터링.png')
caption('그림 2  사진 선택(왼쪽)과 이미지 메시지 필터(오른쪽)')
para('앱에서 사진을 백엔드로 보내면 서버가 Cloudinary에 업로드한다. 반환된 URL과 관리용 식별자를 DB에 저장하고, 해당 업로드를 참조하는 이미지 메시지를 생성한다. 파일은 Cloudinary에 보관하며, 실패한 사진은 선택 상태를 유지해 다시 전송할 수 있도록 하였다.')
title('학습 결과 3  투표 생성과 마감 설정')
para('여행 중 식당이나 방문 장소를 정할 때 사용할 수 있도록 투표를 구현하였다. 질문과 2~10개의 항목을 등록하고, 단일 선택 또는 복수 선택을 설정할 수 있다. 항목에는 여행에 저장한 장소도 연결할 수 있다.')
pair('투표 추가1.png','투표 추가2.png')
caption('그림 3  투표 항목과 장소 연결(왼쪽), 자동 마감 설정(오른쪽)')
para('자동 마감은 빠른 시간 선택과 날짜·시간 직접 입력을 지원한다. 마감 여부는 서버에서 최종 판단하며, 작성자 또는 해당 채팅방에 접근 가능한 방장은 수동으로 마감할 수 있다.')
title('학습 결과 4  투표 참여와 결과 확인')
para('생성한 투표는 채팅 안에 표시된다. 항목을 누르면 선택하고, 같은 항목을 다시 누르면 취소하도록 하였다. 득표 수와 비율, 참여 인원, 남은 시간을 함께 보여준다.')
t=para(style=picture_style);picture(t,'투표 채팅내 화면.png',47000,38000)
caption('그림 4  채팅 안에서 확인하는 투표 결과')
para('투표 설정은 chat_poll, 항목은 chat_poll_option, 사용자 선택은 chat_poll_vote에 나누어 저장하였다. 투표·사용자·항목의 조합을 고유하게 관리해 같은 항목에 중복 투표하지 못하도록 하였다.')
para('복수 선택에서도 참여 인원은 사람별로 한 번만 집계한다. 항목별 비율은 참여 인원 기준이므로 합계가 100%를 넘을 수 있다. 연결된 장소가 삭제되어도 생성 당시 장소 이름과 주소는 보존한다.')
title('학습 결과 5  여행 공지 작성과 공유')
para('집합 시간처럼 대화 중 지나치기 쉬운 내용을 별도 공지로 관리하였다. 현재 여행 멤버는 모두 조회할 수 있고, 작성·수정·삭제·고정은 방장만 처리하도록 하였다.')
pair('공지 화면.png','공지작성 화면.png')
caption('그림 5  고정 공지 목록(왼쪽)과 공지 작성 화면(오른쪽)')
para('공지는 trip_notice에 저장하고, 고정 공지를 먼저 보여준 뒤 최신순으로 정렬한다. 수정 버전을 비교하여 오래된 내용으로 덮어쓰는 요청을 차단한다. 새 공지를 등록할 때 다른 멤버에게 알림을 예약하며 수정·고정 변경·삭제에는 추가 알림을 보내지 않는다.')
title('개발 일정과 후속 확인 계획')
para('다음은 발표자료에 사용한 프로젝트 일정이다. 실시간 그룹 채팅 기능 추가 행의 7주차 칸에 완료 표시를 반영하였다. 기존 주차별 계획은 그대로 유지하였다.')
t=para(style=picture_style);picture(t,'gantt',50000,31000)
caption('그림 6  7주차 발표자료의 프로젝트 일정')
para('이번 구현에서는 메시지를 전송하는 기능 외에도 재접속 후의 데이터 갱신, 파티별 접근 제한, 공지 변경 충돌과 알림 재시도를 함께 다루었다. 여러 사용자가 같은 정보를 공유할 때는 저장과 조회뿐 아니라 현재 권한과 변경 시점도 확인해야 한다는 점을 배웠다.')
para('후속 작업으로 실제 기기의 채팅·공지 알림 수신과 화면 이동을 확인할 예정이다. 앱의 실행 상태와 네트워크 연결 상태를 나누어 점검하고, 탈퇴나 권한 변경 이후에도 정보 접근이 올바르게 제한되는지 확인하겠다. 실기기 푸시 수신은 아직 검증하지 않은 항목으로 남겨 두었다.')
dest=out/'2026-2학기__010_최정흠_주간학습보고서_7주차_이미지포함.hml'
E.ElementTree(root).write(dest,encoding='utf-8',xml_declaration=True)
print(dest,'images',count)

