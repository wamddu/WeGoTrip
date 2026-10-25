# 채팅 푸시 및 공통 발송 기반

## 적용 상태

2026-10-25 사용자 승인 후 `014-push-outbox.sql`을 WeGoTrip DB에 적용했다. 기존 채팅 10건은 변경하지 않았고 과거 메시지는 발송 대기에 추가하지 않았다. 적용 전 스키마는 `tmp/chat-diagnostics/schema-before-014-1792912857674.sql`에 보관했다. 동시 채팅 저장 시 계정 잠금 충돌을 막기 위해, 비어 있는 신규 `push_event`에 수신 대상 스냅샷·확장 완료 메타데이터까지 반영했다. 이 최종 보완 전 스키마는 `tmp/chat-diagnostics/schema-before-014-final-1792914269515.sql`에 별도 보관했다.

로컬 `backend/.env`에 `PUSH_ENABLED=true`, `FIREBASE_PROJECT_ID=wegotrip-65c44`를 설정했다. 로컬 Google Application Default Credentials(ADC)에 해당 프로젝트의 `cloudmessaging.messages.create` 권한이 있음을 읽기 전용 IAM 요청으로 확인했다. 서버를 재시작해야 새 코드와 설정이 반영된다. 실제 Android 수신 테스트는 사용자의 요청으로 생략했으며, 실기기 수신 성공을 확인했다고 간주하지 않는다.

## 실행 준비

1. 채팅 스키마 013까지 준비한 DB에 `backend/db/migrations/014-push-outbox.sql`을 적용한다. 위 로컬 연결 DB는 이미 적용 완료다.
2. 서버에서 `PUSH_ENABLED=true`와 앱과 동일한 `FIREBASE_PROJECT_ID`를 설정한다. `FIREBASE_CREDENTIALS_FILE`에 서비스 계정 JSON의 로컬 경로를 지정하거나 ADC를 사용한다. 로컬 인증 파일은 서버 배포 환경으로 자동 전달되지 않으므로 배포 시 해당 환경의 서비스 계정/ADC를 별도로 구성한다. 비밀 키를 클라이언트나 저장소에 넣지 않는다.
3. 백엔드를 다시 실행한다. 시작 로그의 `Firebase push sender configured for project ...`를 확인한다. 설정·인증 파일이 없으면 발송 모듈은 대기하고 채팅 저장은 유지한다. 기본 `push.enabled=false`인 다른 환경에서는 대기 기록도 생성하지 않는다.
4. Android/iOS는 Firebase 모듈이 포함된 개발 앱을 사용한다. Expo Go는 지원하지 않는다. 웹은 기존 Firebase 웹 설정과 VAPID 키 및 HTTPS/localhost가 필요하다.
5. 수신 계정에서 OS/브라우저 알림 권한을 허용하고 기기를 등록한 뒤 **내 정보 → 푸시 알림**도 켠다. 계정 설정과 OS 권한은 별개이며, 이번 구현은 사용자의 기존 설정을 자동으로 켜지 않는다.

## 동작

텍스트·이미지 메시지와 새 투표의 생성 시, 채팅 저장 트랜잭션 안에서 현재 수신 대상의 계정·기기 ID와 토큰 해시를 `push_event.targets_json`에 기록한다. 작성자 자신의 모든 기기는 제외하며, 전체 채팅은 여행 멤버, 파티 채팅은 현재 해당 파티 멤버만 대상이다. 알림이 꺼져 있거나 등록 기기가 없는 계정에는 대기를 생성하지 않는다. 생성 요청을 같은 멱등 키로 재시도해도 대기를 중복 생성하지 않는다. 기존 투표 참여·취소·마감과 이미지 파일만 업로드한 단계에는 푸시를 만들지 않는다.

채팅 커밋 후 `PushFanout`이 별도 트랜잭션에서 기록된 대상에 대해서만 `push_delivery`를 생성한다. 채팅 작성 중에는 다른 수신 계정·기기의 외래키 잠금을 획득하지 않으므로 작성자 계정 → 여행 순서의 기존 잠금과 충돌하지 않는다. 기기별 생성과 `expanded_at` 기록은 함께 커밋되며, DB 충돌 시 다음 작업에서 다시 준비한다. 새로 등록된 기기에 이전 메시지를 확장하지 않으며, 로그아웃으로 발송 내역이 모두 삭제되어도 이미 확장한 이벤트는 다시 처리하지 않는다. 대상 JSON은 확장이 끝나면 비운다. 이 분리는 [MySQL의 외래키 검사 잠금](https://dev.mysql.com/doc/refman/8.4/en/innodb-locks-set.html)을 고려했다.

기본 알림은 `새 채팅 메시지` / `참여 중인 여행 채팅에 새 메시지가 도착했어요.`다. 대화 원문, 작성자 이름, 사진 URL, 투표 내용은 FCM payload에 넣지 않는다. `data`에는 종류·수신 계정·여행·파티·메시지·이벤트·발송 ID만 포함한다. 알림을 누른 후 기존 인증 API로 대화를 조회한다.

`PushWorker`는 기본 1초 간격으로 최대 20개 대기를 처리한다. 각 대기는 짧은 DB 트랜잭션에서 선점하며 FCM 호출은 DB 잠금 밖에서 실행한다. 발송 직전에 현재 계정 상태, 알림 허용, 여행·파티 멤버십, 여행 활성 상태, 기기 소유자와 토큰 일치를 다시 검사한다. 토큰이 갱신되거나 로그아웃·탈퇴·멤버 제외된 기기에는 이전 대기를 보내지 않는다.

## 저장과 재시도

- `push_event`: 종류와 원본 ID의 고유 제약으로 생성 이벤트를 구분하고, 수신 대상 스냅샷과 확장 완료 시각을 기록한다. 여행/파티는 NULL을 허용하여 향후 서비스 공지에도 사용할 수 있다.
- `push_delivery`: 이벤트·기기의 고유 제약, 선점 토큰과 5분 임대, 시도 수, 다음 시각, 오류 코드, 접수 시각을 보관한다. FCM 등록 정보 원문은 기존 `user_device`에만 두고 대기에는 해시를 기록한다.
- 상태: `PENDING → SENDING → SENT / RETRY / SKIPPED / FAILED / EXPIRED`.
- 재시도는 최소 15초부터 지수 간격으로 늘리며 최대 1시간 간격, 7회 시도, 기본 24시간 유효기간을 적용한다. QUOTA_EXCEEDED 오류는 최소 60초를 기다린다. `push.ttl-seconds`는 60초~4주 범위에서 설정할 수 있다.
- 임대가 만료된 대기는 다른 작업자가 다시 선점할 수 있다. 동일 시점의 동시 선점은 조건부 갱신으로 한 작업자만 성공한다.
- `UNREGISTERED` 응답에서만 기존 소유자와 토큰이 일치하는 기기를 잠근 후 제거한다. `INVALID_ARGUMENT`를 이유로 유효한 기기를 삭제하지 않는다. 새 토큰으로 바뀐 기기도 보존한다.
- `SENT`는 FCM 접수 상태이며 사용자 기기의 표시나 열람 확인이 아니다. 외부 접수 후 응답 유실·프로세스 중단 구간에는 중복 전달이 가능하다. 클라이언트는 발송 ID로 중복 표시/열기를 줄이고 Android 알림은 채팅방별로 묶는다.
- 대기·이벤트의 자동 장기 보관 정리는 이번 범위에 포함하지 않는다. 운영 시 보관 기간에 맞춰 별도 정리 작업을 추가한다.

## 클라이언트 수신과 이동

네이티브는 Firebase foreground 수신을 현재 로그인 계정과 대조한 후 Expo 로컬 알림으로 표시한다. 앱이 백그라운드/종료 상태일 때는 FCM notification으로 표시하고 Firebase의 열기/초기 알림과 Expo 응답을 처리한다. 웹은 foreground 알림, 서비스 워커 클릭 시 기존 창 포커스·메시지 전달 또는 동일 origin의 새 창 열기를 지원한다.

`PushNavigation`은 원격 데이터의 종류와 숫자 ID를 검증하며 외부 URL은 사용하지 않는다. 로그인 복원이 완료될 때까지 열기 요청을 보관하고 수신 계정이 일치할 때만 이동한다. `/trip/{tripId}/chat`에 `chatPartyId`를 전달해 해당 파티를 선택한다. 이동 이후의 조회 권한은 서버가 다시 검사한다.

## 공지 확장

연결된 종류는 `CHAT_MESSAGE`와 `TRIP_NOTICE`다. 여행 공지의 방장 전용 API·발송 정책·화면 이동 코드 및 승인된 015 공지 테이블의 실제 DB 적용을 완료했다. [여행 공지 구현 및 적용 상태](TRIP-NOTICE-IMPLEMENTATION.md)를 참고한다. 서비스 공지를 추가할 때는 원본 저장·권한·대상 정책·클라이언트 이동을 추가하며 공통 `PushSender`·`FcmPushSender`·`PushWorker`와 기기 등록·임대·재시도는 재사용한다. 서비스 관리자 발송 화면과 개인 알림함 API는 추가하지 않았다.

## 검증

최종 확인: 백엔드 전체 141개 테스트, 프런트엔드 158개 테스트, TypeScript 검사 및 웹·Android·iOS 번들 생성이 통과했다. 실제 기기 수신은 사용자의 요청으로 검증하지 않았다.

H2 + FCM 대역 테스트는 원자성, 동시 작성자, 발송 대상 스냅샷 및 확장 후 로그아웃, 작성자 제외, 여러 기기, 전체/파티 격리, 이미지/투표 생성, 중복 요청, 설정 변경·파티 제외·토큰 변경, 재시도·임대 복구·동시 선점, 유효기간, 등록 해제 토큰 정리를 검사한다. Firebase나 사용자 기기로 테스트 메시지를 보내지 않는다. 프런트엔드는 ID 검증·큰 정수 보존, 임의 URL 무시, 중복 표시/열기 구분, 서비스 워커 클릭을 검사한다.

```powershell
# backend: isolated H2 test profile
./gradlew.bat test --no-daemon
# frontend
npm test
npm run typecheck
npm run build:web
npm run build:native
```

공식 문서: [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup), [FCM 발송](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk), [FCM 오류](https://firebase.google.com/docs/cloud-messaging/error-codes), [React Native Firebase 알림 처리](https://rnfirebase.io/messaging/notifications), [Expo SDK 57 Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).
