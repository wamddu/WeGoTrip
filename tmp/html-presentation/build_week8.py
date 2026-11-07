from pathlib import Path
import re
root=Path('C:/Programings/2026_2_창의학기제')
old=(root/'output/presentations/WeGoTrip_Chat_Notice/WeGoTrip_채팅_투표_공지.html').read_text(encoding='utf8')
dep=Path('C:/Users/user/Documents/카카오톡 받은 파일/WeGoTrip_EC2_Firebase.html').read_text(encoding='utf8')
css=re.search(r'<style>(.*?)</style>',old,re.S).group(1)
js=re.search(r'<script>(.*?)</script>',old,re.S).group(1)
sections=re.findall(r'<section\b.*?</section>',old,re.S)
dsecs=re.findall(r'<section\b.*?</section>',dep,re.S)
controls=old[old.index('<div class="help">'):old.index('<script>')]
slides=[]
def slide(title,body,cls=''):
 n=len(slides)+1
 slides.append(f'<section class="slide {cls}" aria-label="{n}. {title}"><header><h2>{title}</h2></header>{body}<footer><span>We Go Trip · 10조 · 8주차</span><span>{n:02} / 14</span></footer></section>')
def block(t,p):return f'<div class="text-block"><h3>{t}</h3><p>{p}</p></div>'
def bug(title,symptom,cause,fix,check):
 slide(title,f'<p class="lead8">{symptom}</p><div class="bug8"><div><span class="num">원인</span><h3>{cause}</h3></div><div><span class="num">수정</span><h3>{fix}</h3></div></div><div class="statement">{check}</div>')
slide('We Go Trip','<div class="cover-body"><div><h1>We Go Trip</h1><p class="cover-sub">8주차 · 서버 배포와 Android APK 테스트</p><p class="team">10조<br><span>2026.11.02</span></p></div><div class="cover-index"><div><b>01</b><span>공동 서버 배포</span></div><div><b>02</b><span>실제 설치용 APK 빌드</span></div><div><b>03</b><span>테스트와 버그 수정</span></div></div></div>','cover')
slide('GPS 위치 공유 구현을 미룬 이유','<p class="lead8">GPS 기능에 앞서, 여러 기기가 함께 사용할 테스트 환경을 준비</p><div class="scope"><div><span class="num">실제 앱으로 확인</span><h3>커진 프로젝트 규모</h3><p>Expo Go에서의 확인을 넘어<br>실제 빌드·설치 환경에서<br>기능을 테스트할 필요</p></div><div><span class="num">같은 서버에 접속</span><h3>여러 기기의 위치 공유</h3><p>GPS 기능을 테스트하려면<br>서버를 배포하고 여러 기기가<br>동일한 서버에 접속해야 함</p></div></div><div class="statement">이번 주: 서버 배포와 APK 테스트 → 내주: GPS 위치 공유 기능 구현</div>')
gantt=re.search(r'<div class="gantt-wrap">.*?</div>',sections[2],re.S).group(0)
slide('프로젝트 일정',gantt)
for idx,title,lead in [(0,'공동 EC2 서버로 실행 환경 변경','개발 PC에서 실행하던 백엔드를 옮겨, 웹과 앱이 같은 서버에 접속'),(1,'JAR 배포와 서버 실행 관리','빌드한 백엔드를 EC2에 전송하고 systemd 서비스로 실행'),(2,'팀원 접속 주소와 보안 규칙','API·지도 API 주소를 변경하고 EC2와 RDS의 접속 규칙을 설정')]:
 svg=re.search(r'<svg\b.*?</svg>',dsecs[idx],re.S).group(0)
 slide(title,f'<p class="deploy-lead">{lead}</p><div class="deploy-art">{svg}</div>')
slide('Firebase 푸시 알림 연결','<p class="lead8">EC2 백엔드의 기존 알림 발송 기능에 Firebase 인증을 연결</p><div class="scope firebase8"><div>'+block('인증 파일과 서버 설정','서비스 계정 JSON을 EC2에 보관<br>인증 파일 경로·프로젝트 ID 설정<br>푸시 활성화 후 서비스 재시작')+block('초기화 결과 확인','Firebase 발송 모듈 초기화 로그 확인<br>기기 등록과 푸시 수신 연동 확인')+'</div><div>'+block('메시지에서 기기 알림까지','메시지 저장 → 발송 대상 확인<br>FCM 토큰으로 요청 → 수신 기기에 전달')+block('서버와 앱의 설정 분리','서버용 private key는 EC2에서 관리<br>APK에는 Android 클라이언트 설정 사용')+'</div></div><div class="statement">웹과 Android 앱이 공통 백엔드의 알림 기능을 사용</div>')
slide('설치용 Android APK 빌드','<p class="lead8">EAS preview 프로필로 Metro 없이 실행되는 APK 제작</p><div class="steps8"><div><b>01</b><h3>환경 설정</h3><p>실제 데이터 모드<br>API·지도 API 주소<br>Firebase 설정 파일</p></div><div><b>02</b><h3>EAS 빌드</h3><p>preview 환경의 값 사용<br>클라우드에서<br>Android 앱 생성</p></div><div><b>03</b><h3>다운로드·설치</h3><p>완료된 APK 다운로드<br>기기에 설치하고<br>배포 서버에 접속</p></div></div><pre>npx eas-cli@27.2.0 build --platform android --profile preview</pre><p class="note">로컬 .env.local의 변경은 EAS 환경에 자동 반영되지 않으므로 별도로 갱신</p>')
slide('빌드 설정과 업데이트 설치','<div class="scope"><div><span class="num">빌드 전 확인</span><h3>서버·Firebase 설정</h3><p>API와 지도 주소는 /api로 종료<br>Android 알림 채널을 default로 통일<br>HTTP 허용은 preview 테스트에 한정</p></div><div><span class="num">빌드 후 확인</span><h3>동일한 서명으로 업데이트</h3><p>같은 패키지와 서명 키 유지<br>앱 삭제 없이 새 APK 설치<br>서명·권한·서버 주소 포함 여부 확인</p></div></div><div class="statement">1.0.0(1) 테스트 빌드 이후 수정 사항을 누적해 1.0.6(6) 제작</div><p class="note">로그인·사진·채팅·알림은 설치한 기기에서 확인하며, APK 파일 검증과 구분</p>')
bug('사진 업로드 오류 수정','Android 사진 전송 중 Unsupported FormDataPart implementation 오류 발생','Expo 전송 기능이<br>{ uri, name, type } 객체를<br>지원하지 않음','expo-file-system의 File로<br>실제 사진 데이터를 전달하고<br>임시 파일을 정리','실제 multipart encoder로 JPG·PNG·GIF와 변환 JPEG의 바이트·파일명·MIME 검증')
bug('장소 검색 버튼의 터치 영역 수정','검색 버튼의 가운데는 동작하지만, 좌우 영역은 반응하지 않는 증상','버튼 비활성 상태에<br>undefined가 전달되는 경로 발견<br>검색 API는 정상 응답','Boolean(disabled || loading)으로<br>상태를 명시하고 box-only로<br>버튼 본체가 터치를 받도록 변경','수정 전 실패하는 회귀 테스트 확인 → 기본 상태·입력 전후·로딩 전후 검사')
bug('화면 전환 시 하단바 고정','화면 이동과 함께 움직이던 하단 네비게이션의 구조를 정리','각 화면이 하단바를 포함해<br>화면 전환과 하단바 배치가<br>함께 처리되는 구조','공통 레이아웃에서<br>Stack과 하단바를 형제로 배치<br>기기 여백은 Frame에서 한 번만 처리','목 데이터 웹 화면에서 위치·크기 유지, 중복 표시 없음, 숨김·복원 확인')
slide('채팅 진입 위치와 키보드 대응','<div class="change8"><div><h3>채팅 재진입 시 최신 메시지</h3><p>채팅 전용 스크롤 영역 분리<br>화면·내용 크기 확정 후 맨 아래로 이동</p><p class="blue8">이전 대화를 읽는 중에는 현재 위치 유지</p></div><div><h3>키보드와 대화 가독성</h3><p>키보드가 열리면 대화 영역 축소<br>입력창을 키보드 위에 배치</p><p class="blue8">연속 작성자 생략 · 5분 간격 기준 시간 정리</p></div></div><div class="statement">최신 빌드: 타입 검사·프런트엔드 194개 테스트 통과</div><p class="note">수정 후 키보드·터치·업로드 동작은 Android 실기기에서 재확인 필요<br>방 이름·메시지 내용이 담긴 푸시 미리보기는 변경한 백엔드의 별도 재배포 필요</p>')
slide('내주 계획','<div class="next8"><span class="num">9주차</span><h1>GPS 위치 공유<br>기능 구현</h1><p>여러 기기가 같은 서버에 접속하는 환경에서<br>멤버 간 위치 공유 기능 구현과 동작 확인</p></div>')
css+='''
.lead8{font-size:29px;margin:38px 0 0;font-weight:600}.lead8+.scope{padding-top:46px;padding-bottom:22px}.scope p{font-size:26px}.deploy-lead{font-size:24px;color:var(--muted);margin:23px 0 12px}.deploy-art{height:568px}.deploy-art svg{width:100%;height:100%;font-family:Deck,"Malgun Gothic",sans-serif}.mono{font-family:Consolas,monospace}.firebase8{padding-top:40px!important;gap:65px}.firebase8 h3{font-size:29px}.firebase8 p{font-size:24px;margin:0}.firebase8 .text-block{margin-bottom:26px}.firebase8+.statement{margin-top:0}.steps8{display:grid;grid-template-columns:repeat(3,1fr);gap:65px;margin:55px 0 40px}.steps8 b{color:var(--blue);font-size:23px;display:block;margin-bottom:20px}.steps8 h3{font-size:34px}.steps8 p{font-size:26px;color:var(--muted)}pre{font-size:23px;background:#f0f6fe;padding:24px 28px;white-space:pre-wrap;color:var(--blue);font-family:Consolas,monospace}.bug8{display:grid;grid-template-columns:1fr 1fr;gap:80px;padding:62px 0 44px}.bug8>div+div{border-left:1px solid var(--line);padding-left:65px}.bug8 h3{font-size:31px;line-height:1.7;font-weight:400}.bug8+.statement{font-size:24px}.change8{display:grid;grid-template-columns:1fr 1fr;gap:65px;padding:66px 0 55px}.change8 h3{font-size:31px}.change8 p{font-size:25px;color:var(--muted);margin-top:25px}.change8 .blue8{color:var(--blue);font-size:23px}.next8{padding:75px 0 0}.next8 h1{font-size:66px;color:var(--blue);margin:25px 0 35px}.next8 p{font-size:29px;color:var(--muted)}
'''
out=root/'output/presentations/WeGoTrip_Week8';out.mkdir(exist_ok=True,parents=True)
dest=out/'WeGoTrip_8주차_서버배포_APK테스트.html'
dest.write_text('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>We Go Trip · 8주차 서버 배포와 APK 테스트</title><style>'+css+'</style></head><body>'+''.join(slides)+controls+'<script>'+js+'</script></body></html>',encoding='utf8')
assert re.search(r'<div class="gantt-wrap">.*?</div>',dest.read_text(encoding='utf8'),re.S).group(0)==gantt
print('Created 14 slides; original Gantt unchanged')
