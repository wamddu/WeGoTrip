from pathlib import Path
import xml.etree.ElementTree as E,copy
out=Path('output/reports');out.mkdir(exist_ok=True)
fields=[
('금주 학습목표','여러 기기가 같은 서버를 사용하는 환경을 마련하고, Expo Go가 아닌 실제 Android 설치 앱에서 기능을 점검한다. EC2 백엔드 배포와 Firebase 연결, EAS APK 빌드를 진행하며, 테스트에서 발견한 사진 업로드·버튼 터치·하단바·채팅 문제의 원인을 분석하고 수정한다.'),
('학습내용','1. 서버 배포: Spring Boot 실행 JAR를 EC2로 전송하고 systemd 서비스로 등록하였다. 기존 RDS를 연결하고 API·지도 API 주소와 보안그룹 규칙을 변경하였다. Firebase 서비스 계정 인증을 적용해 푸시 발송 기능을 연결하였다.\n2. APK 빌드: EAS preview 환경에 실제 서버 주소와 Android Firebase 설정을 등록하였다. 설치용 APK를 생성하고, 동일한 패키지와 서명 키를 유지하여 수정 버전을 업데이트할 수 있도록 하였다.\n3. 오류 수정: 사진 업로드를 File 객체 기반으로 변경하고, 버튼의 활성화 상태와 터치 영역을 수정하였다. 하단바를 공통 레이아웃으로 옮기고, 채팅의 초기 스크롤·키보드 회피·연속 메시지 표시를 정리하였다. 세부 과정은 다음 쪽에 작성하였다.'),
('학습방법','문제가 발생한 기능을 서버 응답, 앱 상태, 네이티브 전송 및 화면 배치로 나누어 확인하였다. 공식 문서와 로그를 참고하고, 기존 코드에서 실패하는 회귀 테스트로 원인을 좁혔다. 수정 후 타입 검사·자동 테스트·목 데이터 웹 화면·APK 파일 검증을 수행한 결과를 구분하여 정리하였다.'),
('학습성과 및 목표달성도','공동 서버와 설치형 앱의 테스트 환경을 마련하고 최신 APK 1.0.6(6)을 제작하였다. 최신 빌드 기록에서 프런트엔드 194개 테스트와 타입 검사 통과를 확인하였다. 개발 환경에서 정상인 기능도 Android 전송 방식과 화면 동작에서 문제가 생길 수 있음을 배웠다. GPS 구현은 다음 주로 조정했으며, 수정 후 실기기 재검증과 푸시 미리보기용 백엔드 재배포는 후속 과제로 남겼다.'),
('참고자료 및 문헌','AWS EC2·RDS 공식 문서 / Spring Boot·Gradle 공식 문서\nExpo EAS Build·FileSystem 공식 문서 / React Native 공식 문서\nFirebase Cloud Messaging 공식 문서 / systemd 공식 문서 / Git 공식 문서'),
('내주 계획','GPS 위치 공유 기능을 구현한다. 위치 권한 요청과 좌표 수집, 서버 전송 및 여행 멤버의 위치 조회 흐름을 구성하고 여러 기기에서 확인할 계획이다. APK 수정 사항도 실제 Android 기기에서 재검증하여 위치 공유 개발의 기반을 안정화하겠다.')]
pages=[('세부 학습내용 1. 공동 서버 배포와 Firebase 연결',[
('1. 작업 순서 조정 배경','원래 계획은 GPS 위치 공유 구현이었으나, 기능이 늘어나면서 실제 설치 앱에서 전체 흐름을 확인할 필요가 커졌다. 특히 여러 기기의 위치를 공유하려면 각 기기가 동일한 백엔드에 접속해야 한다. 이에 서버 배포와 APK 테스트를 먼저 진행하였다. GPS 기능 자체를 완료한 것은 아니며, 이번 작업은 기능 구현에 필요한 공동 실행 환경을 마련하는 데 목적이 있다.'),
('2. 실행 JAR 배포와 서비스 관리','개발 PC에서 Gradle의 bootJar 작업으로 Spring Boot 실행 JAR를 만들고, SCP를 이용해 EC2의 app.jar로 전송하였다. 배포 자료에는 빌드 성공, 파일 전송 완료, 로컬과 서버 파일의 SHA-256 일치 확인이 기록되어 있다. 이후 wegotrip.service를 systemd에 등록해 백엔드 프로세스를 관리하도록 하였다. SSH 접속을 종료해도 서비스를 유지하고, Restart=on-failure로 오류 종료 시 재시작하며, 부팅 시 자동 실행하도록 enabled 상태를 설정하였다. active (running)은 현재 실행 상태, enabled는 자동 시작 등록 상태를 의미한다. EC2 자체가 실행 중이어야 하며, 자동 시작 등록을 실제 재부팅 시험 완료와 동일하게 보지는 않았다.'),
('3. API 주소와 네트워크 접근 설정','프런트엔드의 EXPO_PUBLIC_API_URL과 EXPO_PUBLIC_MAPS_API_URL을 EC2의 HTTP 8080/api 주소로 변경하였다. API 주소 끝의 /api를 유지하고, EC2 인바운드 TCP 8080에는 허용할 팀원 공인 IP를 등록하였다. 기존 MySQL RDS는 유지하면서 RDS 인바운드 3306에 EC2 보안그룹을 소스로 추가하였다. 웹과 앱은 백엔드를 호출하고 백엔드가 DB에 접근하는 구조이다. 서비스 실행 상태와 HikariPool 연결 완료 로그, 외부 API의 인증 응답으로 실행·DB 연결·외부 접근을 각각 확인하였다.'),
('4. Firebase 서버 인증과 알림 전달','EC2에서 Firebase 인증정보를 찾지 못해 발생하던 Push sender is unavailable 경고에 대응하여 서비스 계정 JSON을 서버에 보관하고 읽기 권한을 제한하였다. FIREBASE_CREDENTIALS_FILE, FIREBASE_PROJECT_ID와 PUSH_ENABLED=true를 설정한 뒤 서비스를 재시작하였다. 초기화 완료 로그를 확인하고 클라이언트 기기 등록 및 알림 수신을 연동하였다. 메시지 저장 후 백엔드가 수신 대상의 권한·알림 설정·등록 토큰을 확인하여 FCM에 발송을 요청하며 작성자는 제외한다. 서버용 private key는 EC2에서만 관리하고 APK나 EXPO_PUBLIC 변수에 포함하지 않는다. FCM 접수와 실제 기기의 표시·열람은 서로 다른 단계이다.')]),
('세부 학습내용 2. Android APK 빌드 환경과 검증',[
('1. EAS preview 빌드','frontend에서 npx eas-cli@27.2.0 build --platform android --profile preview 명령으로 설치용 APK를 생성하였다. preview APK는 Metro 개발 서버 없이 실행되지만 데이터 요청을 처리하는 배포 백엔드는 계속 실행되어야 한다. 초기 빌드는 1.0.0(1), 패키지는 com.jeongheaum.frontend이며 Android 7(API 24) 이상을 대상으로 하였다. 이후 수정 사항을 누적해 최신 1.0.6, versionCode 6으로 빌드하였다. 동일한 패키지와 서명 키를 유지하여 기존 앱을 삭제하지 않고 업데이트 설치할 수 있도록 하였다.'),
('2. 로컬 설정과 클라우드 빌드 설정 분리','EAS의 preview 환경에 EXPO_PUBLIC_DATA_SOURCE=http, API 주소, 지도 API 주소를 등록하고 GOOGLE_SERVICES_JSON을 secret/file 변수로 설정하였다. 로컬 .env.local을 수정해도 EAS에 저장된 환경변수는 자동으로 변경되지 않으므로 별도로 갱신해야 한다. Android용 google-services.json은 클라이언트 설정이며, 백엔드의 Firebase 서비스 계정 인증 파일과 역할이 다르다. .easignore로 백엔드, 보고서, 임시 파일, 로컬 환경 파일과 자격 증명, 생성된 Android/iOS 폴더를 제외하고 EAS가 설정에 따라 네이티브 프로젝트를 생성하도록 하였다.'),
('3. Android 알림과 통신 설정','firebase.json의 messaging_android_notification_channel_id와 Expo Notifications의 defaultChannel을 default로 통일하였다. 값이 다르면 Android manifest 병합이 실패할 수 있으므로 앱에서 생성하는 채널과 서버가 보내는 채널 ID도 함께 맞추었다. 현재 HTTP 테스트 서버를 사용할 수 있도록 preview 프로필에서만 cleartext 통신을 허용하였다. 다른 프로필에서는 HTTP API 주소를 거부하도록 하여 테스트 설정의 적용 범위를 구분하였다.'),
('4. APK 확인 항목과 후속 검증','빌드 기록상 APK v2 서명 검증, 기존 키와의 일치, 버전·API 주소·지도 주소·Firebase 활성화·알림 권한·기본 알림 채널·HTTP 테스트 통신 허용을 확인하였다. 최신 빌드에는 adjustResize와 채팅·푸시 수정 코드도 포함되었다. 이러한 파일 검증은 실제 휴대폰 동작 확인을 대신하지 않는다. 배포 자료에서 초기 APK의 서버 연동과 알림 수신을 확인한 것과 별개로, 최신 수정 버전의 사진 전송, 키보드, 터치 좌표별 반응은 재검증이 필요하다. 여행·그룹별 푸시 미리보기 클라이언트 코드도 포함했지만 방 이름과 메시지 내용을 보내는 백엔드는 별도 재배포가 필요하다. 최신 APK 수정 작업 자체에서는 추가 서버 배포나 DB 변경을 수행하지 않았다.')]),
('세부 학습내용 3. 테스트 중 발견한 오류와 수정',[
('1. 사진 업로드 오류','Android에서 Unsupported FormDataPart implementation 오류가 발생하였다. Expo의 전송 기능이 기존 { uri, name, type } 객체를 multipart 데이터로 처리하지 못하는 것이 원인이었다. expo-file-system의 File 객체를 전달하여 실제 사진 바이트를 읽도록 변경하였다. React Native 기본 Blob의 바이너리 생성 제약을 피하고, 전송 후 임시 파일 정리도 확인하였다. Expo의 실제 multipart encoder를 사용한 회귀 테스트로 원본 JPG·PNG·GIF와 변환 JPEG의 바이트·파일명·MIME 형식을 검사하였다. 이 단계에서는 타입 검사와 전체 180개 테스트가 통과하였다.'),
('2. 장소 검색 버튼의 부분 터치 문제','버튼 중앙은 동작하지만 좌우가 반응하지 않는 증상을 확인하였다. 배포된 검색 API는 서울역 요청에 HTTP 200과 결과 8개를 반환하여 서버 응답과 UI 문제를 분리하였다. 공통 Button의 disabled || loading이 활성 상태에서 undefined가 되는 경로를 찾아 Boolean(disabled || loading)으로 명시적인 boolean을 전달하도록 수정하였다. 네이티브 버튼 상태가 남고 자식 글자만 터치 대상이 될 수 있는 경로에 대응한 것이다. pointerEvents="box-only"로 버튼 본체가 터치를 받도록 하고 로딩 표시도 추가하였다. 수정 전 실패하는 테스트를 확인한 뒤 기본 상태, 입력 전후와 로딩 전후를 검사했으며 전체 181개 테스트가 통과하였다.'),
('3. 하단 네비게이션 고정','하단바가 각 화면 내부에 있어 화면 전환과 함께 움직이던 구조를 변경하였다. 로그인 후 공통 레이아웃에서 Stack과 하단바를 형제로 배치하고, 각 Page 및 여행 상세 화면의 중복 하단바를 제거하였다. 공통 Frame이 기기 상하단 여백을 한 번만 처리하며, 로그인·새 여행·작성·채팅 화면에서는 하단바를 숨긴다. 목 데이터 웹 화면에서 홈, 내 여행, 여행 상세, 장소 이동 중 위치·크기 유지와 단일 표시를 확인하고 작성 화면의 숨김과 뒤로가기 복원을 검사하였다. 해당 단계에서 전체 185개 테스트가 통과하였다.'),
('4. 채팅 스크롤·키보드·표시 개선','채팅 전용 스크롤 영역을 분리하고, 진입·재진입·대화방 또는 이미지 필터 변경 시 화면과 내용 크기가 확정된 뒤 최신 메시지 위치로 이동하도록 하였다. 초기 자동 이동 이벤트가 따라가기 상태를 해제하지 않게 하고, 이전 대화를 읽는 중에는 새 메시지가 와도 현재 위치를 유지하도록 했다. 목 데이터 테스트에서 재진입 시 하단 여백 0px과 이전 대화 조회 중 scrollTop 214px 유지가 확인되었다. 키보드가 열리면 대화 영역을 축소해 입력창을 위에 배치하고 adjustResize를 적용하였다. 같은 발신자의 연속 메시지는 첫 메시지에만 작성자를 표시하며, 5분 미만 간격에서는 마지막 메시지에만 시간을 표시한다. 최신 단계에서 타입 검사와 전체 194개 테스트가 통과했으나 Android 기기에서의 재검증은 남아 있다.')])]
r=E.parse(out/'2026-2학기__010_최정흠_주간학습보고서_6주차_완성본.hml').getroot()
prefixes=['여행 멤버의 지출','1. 지출 기록','화면 입력부터','지출 등록부터','Git 공식','여행방 멤버들이']
for prefix,(_,value) in zip(prefixes,fields):
 cell=next(c for c in r.iter('CELL') if ''.join(c.itertext()).startswith(prefix));pl=cell.find('PARALIST');p0=copy.deepcopy(pl.find('P'));shape=p0.find('TEXT').get('CharShape')
 for c in list(pl):pl.remove(c)
 for line in value.split('\n'):
  p=E.SubElement(pl,'P',dict(p0.attrib));t=E.SubElement(p,'TEXT',{'CharShape':shape});E.SubElement(t,'CHAR').text=line
for c in r.iter('CHAR'):
 if c.text:c.text=c.text.replace('6주차','8주차').replace('2026.10.6.~2026.10.12','2026.10.27.~2026.11.2').replace('2026년     10월     13일','2026년     11월     2일')
cells=list(r.iter('CELL'))
for i,c in enumerate(cells):
 if ''.join(c.itertext()).strip()=='학습주차':
  for ch in cells[i+1].iter('CHAR'):
   if ch.text=='6':ch.text='8'
# Do not carry a previous approval signature into a new report.
for c in cells:
 if c.find('.//PICTURE') is not None:
  for t in c.iter('TEXT'):
   for p in list(t):
    if p.tag=='PICTURE':t.remove(p)
sec=r.find('./BODY/SECTION');ps=r.find('.//PARASHAPELIST');cs=r.find('.//CHARSHAPELIST')
def style(align='Left',space='500'):
 p=copy.deepcopy(ps[0]);pid=str(len(ps));p.set('Id',pid);p.set('Align',align);p.set('KeepWithNext','false');p.find('PARAMARGIN').attrib.update(Prev='0',Next=space,LineSpacing='145');ps.append(p);ps.set('Count',str(len(ps)));return pid
bp=style();hp=style(space='700')
def char(size,bold=False):
 c=copy.deepcopy(r.find('.//CHARSHAPE[@Id="10"]'));cid=str(len(cs));c.set('Id',cid);c.set('Height',str(size))
 if bold and c.find('BOLD') is None:E.SubElement(c,'BOLD')
 cs.append(c);cs.set('Count',str(len(cs)));return cid
bc=char(1050);hc=char(1400,True);sc=char(1150,True)
def para(text,shape=bp,ch=bc,br=False):
 p=E.SubElement(sec,'P',{'ParaShape':shape,'Style':'0','PageBreak':str(br).lower()});t=E.SubElement(p,'TEXT',{'CharShape':ch});E.SubElement(t,'CHAR').text=text
for title,items in pages:
 para(title,hp,hc,True)
 for heading,body in items:para(heading,hp,sc);para(body)
dest=out/'2026-2학기__010_최정흠_주간학습보고서_8주차.hml';E.ElementTree(r).write(dest,encoding='utf-8',xml_declaration=True)
md='# 2026-2학기 세종창의학기제 주간학습보고서 (8주차)\n\n10조 · 최정흠 · 22011683 · 컴퓨터공학과\n\n학습기간: 2026.10.27.~2026.11.2. / 학습시간: 6시간 / 과목: 자기주도창의전공2 / 수강학점: 3\n\n'
md+='\n\n'.join('## '+k+'\n\n'+v for k,v in fields)
for title,items in pages:md+='\n\n## '+title+'\n\n'+'\n\n'.join('### '+h+'\n\n'+b for h,b in items)
(out/'8주차_보고서_작성내용.md').write_text(md+'\n',encoding='utf8')
print('HML and Markdown created')
