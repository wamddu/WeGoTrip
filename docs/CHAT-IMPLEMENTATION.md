# 실시간 채팅·이미지·장소 투표

여행 화면의 **대화** 탭에서 사용하는 서버 공유 기능이다. 전체 채팅은 해당 여행의 모든 멤버가 참여하는 채널이며, 파티 채팅은 해당 파티의 현재 멤버만 읽고 쓸 수 있다. 여행 방장도 파티에 포함되지 않으면 그 파티의 채팅에는 접근할 수 없다.

## 실행 준비

1. 기존 DB에 `009-expense-settlement.sql`까지 적용되어 있는지 확인한다. 기존 WeGoTrip DB에는 `sender_id`, `content`, `message_type`을 사용하는 `chat_message` 테이블이 있으므로, 빈 기존 채팅 테이블에는 `backend/db/migrations/011-existing-chat-schema.sql`을 적용한다. 기존 대화가 있다면 작성자·내용·첨부 이전을 먼저 검토한다. `010-chat-polls.sql`은 `chat_message`가 없는 DB 전용이며, 이미 010을 실행하다 중간에 멈춘 경우에도 011로 복구한다. 011은 기존 컬럼·외래키·첨부 테이블을 보존하고, 필요한 컬럼·인덱스·투표 테이블만 추가한다. 애플리케이션은 이 SQL을 자동 실행하지 않는다.
2. `backend/.env`에 아래 세 값을 설정한다. Cloudinary 비밀 키는 백엔드에서만 사용한다.

   ```dotenv
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   users.allowed-origins=http://localhost:8081,http://localhost:8082
   ```

3. `frontend`에서 `npm ci`를 실행한다. 사진 선택에 `expo-media-library`, `expo-image-manipulator`, 웹 파일 선택에 `expo-image-picker`를 사용하므로 기존 개발용 Android/iOS 앱은 새 네이티브 모듈과 사진 접근 권한을 포함하도록 다시 빌드한다. Android는 `npm run android`, iOS는 macOS에서 `npm run ios`로 빌드한다.
4. 프런트엔드는 `EXPO_PUBLIC_DATA_SOURCE=http`, `EXPO_PUBLIC_API_URL=http://localhost:8080/api`로 실행한다. 백엔드는 `./gradlew.bat bootRun`, 프런트엔드는 `npm run web -- --port 8082`로 실행한다.

WebSocket 주소는 API 주소에서 파생한다. 위 설정에서는 `ws://localhost:8080/ws/chat`이다. HTTPS에서는 `wss://`를 사용하며, 역방향 프록시는 `/api`와 `/ws/chat`의 Upgrade 연결을 동일한 서버로 전달해야 한다. API 주소에 서비스 경로 접두사를 사용하는 경우 `/prefix/api`에서 `/prefix/ws/chat`으로 연결한다.

`mock` 모드는 기존의 기기 저장 텍스트 대화를 유지한다. 이미지·투표·실시간 공유는 HTTP 모드에서 제공한다. 기존 기기 대화를 서버로 자동 업로드하지 않는다.

### 자동 마감 스키마 (2026-10-24)

010 또는 011로 채팅 테이블을 준비한 뒤 `backend/db/migrations/012-chat-poll-deadline.sql`을 적용한다. `chat_poll.closes_at`과 `(closed, closes_at)` 인덱스를 추가하며 기존 투표는 자동 마감 없이 유지한다. 연결된 WeGoTrip DB에는 사용자 승인 후 적용을 완료했다. 적용 전 스키마는 `tmp/chat-diagnostics/schema-before-012-1792817530332.sql`에 보관했으며 기존 투표 2개는 자동 마감 없이 유지했다.

### 복수 선택 스키마 (2026-10-24)

복수 선택용 013도 사용자 승인 후 적용 완료했다. 기존 투표 3개는 기본 단일 선택을 유지하며 항목 6개와 기존 선택 내역 2개를 보존했다. 적용 전 `chat_poll`·`chat_poll_vote` 스키마는 `tmp/chat-diagnostics/schema-before-013-1792818737223.sql`에 보관했고, 적용 시 기존 선택 행과 외래키 4개의 보존을 확인했다.

### 기존 DB의 요청 실패 복구 기록 (2026-10-24)

실제 기존 DB에는 `chat_message`가 이미 있어 010의 `CREATE TABLE chat_message`에서 실행이 중단되었다. 따라서 채팅 컬럼이 빠지고 투표 테이블도 생성되지 않아 조회 쿼리에서 MySQL 1054 / SQLState 42S22 오류가 발생했다. 연결된 DB의 기존 채팅 데이터가 0건임을 확인하고, 원래 테이블 구조를 `tmp/chat-diagnostics/schema-before-011.sql`에 보관한 뒤 011을 적용했다. 기존 컬럼·외래키·첨부 테이블을 유지했으며 채팅 조회 쿼리의 정상 실행과 기존 컬럼을 포함한 통합 테스트 통과를 확인했다. 이 DB에는 010을 다시 실행할 필요가 없다.

## 동작

- **텍스트:** 최대 2,000자. 서버가 작성자와 작성 시간을 결정한다. 최신 50개부터 읽고 `이전 대화 보기`로 과거 메시지를 불러온다. 메시지와 투표가 함께 시간순으로 표시된다.
- **사진 선택:** 입력창의 `+ → 사진`을 누르면 하단에서 사진 선택 패널이 올라온다. Android/iOS는 사진 접근을 허용한 뒤 기기의 최근 사진을 3열 격자로 읽고, 아래로 스크롤하면 60장씩 추가로 읽는다. 여러 사진을 선택하면 순서 번호와 하단 미리보기를 표시하며, 다시 누르면 선택을 해제한다. 제한된 사진 접근 권한에서는 `사진 더 허용`으로 범위를 바꿀 수 있다. 웹은 브라우저에서 사진 목록을 직접 읽을 수 없어 `기기에서 사진 가져오기`로 여러 파일을 가져온 후 같은 패널에서 선택한다.
- **이미지 전송:** 패널의 `N장 전송`을 눌러야 업로드가 시작된다. 선택한 순서대로 사진마다 인증된 백엔드에 multipart 업로드 → Cloudinary 저장 → 검증한 HTTPS URL과 public ID의 DB 기록 → 반환된 업로드 ID로 개별 이미지 메시지를 생성한다. 진행률을 표시하고 모두 완료되면 패널을 닫는다. 실패한 사진과 아직 보내지 않은 사진은 선택을 유지한다. 메시지 요청의 응답이 유실돼도 업로드 ID와 기존 멱등 키를 재사용해, 패널에서 재시도할 때 완료된 사진을 다시 보내지 않는다. 패널을 열기 전 입력한 텍스트는 그대로 유지한다. 업로드한 사람과 채팅방이 일치하는 이미지만 한 번 첨부할 수 있다.
- **파일 제한:** 서버는 JPG, PNG, WebP, GIF / 최대 8MiB를 받는다. 네이티브에서 HEIC 등 다른 사진 형식과 용량이 큰 정지 이미지는 전송 시 JPEG로 변환하고 긴 변을 최대 2,560px로 조정한다. 8MiB 이하의 지원 형식은 원본을 전송하며, GIF는 크기가 넘으면 안내한다. 백엔드가 파일 시그니처를 검사하고 Cloudinary가 실제 이미지를 검증한다. 전송한 이미지는 눌러서 확대할 수 있다.
- **웹 자동 압축:** 8MiB 초과 정지 사진은 브라우저에서 긴 변을 최대 2,560px로 축소하고 품질·크기를 조절해 8MiB 이하로 만든 뒤 업로드한다. 작은 사진은 원본으로 보낸다. JPEG는 JPEG로, PNG·WebP는 투명 배경을 보존한 WebP로 저장하며 WebP 인코딩 미지원 시 PNG로 처리한다. EXIF 방향과 비율을 유지한다. GIF·애니메이션 PNG/WebP는 정지 이미지로 바뀌지 않도록 원본 8MiB 제한을 유지한다. 압축 실패 시 업로드하지 않고 선택된 사진을 유지한다.
- **이미지 필터:** 채팅방 선택기 오른쪽의 `이미지` 토글을 켜면 이미지가 첨부된 메시지만 표시한다. 이미지의 설명 문구도 함께 보이며 텍스트·투표 메시지는 숨긴다. 서버의 `imagesOnly=true` 조회로 과거 이미지까지 페이지를 나눠 읽고 새 이미지도 실시간으로 반영한다. 필터를 끄면 전체 대화로 돌아가며, 채팅방을 바꿔도 필터 상태를 유지한다.
- **투표:** 질문 최대 200자, 항목 2~10개, 항목 이름 최대 150자. 생성 화면에서 항목을 추가·삭제할 수 있다. 장소 선택은 기본으로 숨기며, 질문 아래 작은 `장소 연결` 토글을 켜면 각 항목에서 여행에 저장한 장소의 이름·주소를 연결할 수 있다. 토글을 끄면 장소 연결을 해제하고 입력한 항목 이름은 유지한다. 게시 후 항목은 고정된다.
- **자동 마감:** 생성 화면 아래의 작은 `자동 마감` 토글은 기본으로 꺼져 있다. 켜면 10분·30분·1시간·24시간 빠른 선택 또는 날짜(`YYYY-MM-DD`)와 시간(`HH:mm`) 직접 입력을 제공한다. 입력은 기기 시간대 기준이며 API에서는 UTC 시각으로 보낸다. 잘못된 날짜, 지난 시각, MySQL TIMESTAMP 범위 이후의 시각은 거절한다. 기존 투표와 마감 미설정 투표는 수동 마감을 유지한다.
- **타이머:** 마감 기한과 남은 시간을 표시한다. 서버의 `serverNow`와 기기의 단조 증가 경과 시간으로 남은 시간을 계산하므로 기기의 현재 시각 설정에 의존하지 않는다. 마감 후 참여 버튼을 비활성화하며, 서버는 별도로 정확한 마감 시각부터 신규 참여·투표 변경·취소를 거절한다. 작성자·여행 방장은 기한 전에 수동 마감할 수 있다.
- **참여 모드:** 생성 화면의 작은 `복수 선택` 토글은 기본으로 꺼져 있다. OFF는 기존 1인 1표로, 다른 항목을 누르면 변경하고 선택한 항목을 다시 누르면 취소한다. ON은 여러 항목에 각각 한 표씩 선택하며 다시 누르면 해당 항목의 표만 취소한다. 생성 후 모드는 고정된다. 같은 항목의 중복 표는 DB 고유 제약으로도 막는다.
- **결과:** 항목별 득표와 참여 인원을 공유한다. 복수 선택에서도 같은 사람은 참여 인원에 한 번만 포함한다. 항목별 비율은 참여 인원을 기준으로 하므로 여러 항목의 비율 합계가 100%를 넘을 수 있다. 복수 선택은 참여 인원과 전체 표 수를 함께 표시한다. 작성자 또는 해당 채팅방에 접근 가능한 여행 방장이 마감할 수 있다. 마감은 다시 열 수 없다.
- **장소 변경:** 투표 생성 시의 장소 이름·주소를 보존한다. 장소가 삭제되면 장소 ID는 NULL이 되고 기존 이름·주소는 남는다.
- **권한 변경:** 읽기·쓰기·구독·이벤트 전달·주기적 연결 확인마다 현재 계정, tokenVersion, 여행·파티 멤버십을 검사한다. 파티에서 빠진 사용자는 과거 대화도 조회할 수 없다.
- **종료한 여행:** 대화 조회만 허용한다. 메시지·이미지 업로드·새 투표·투표 변경·마감은 차단한다.
- **파티 삭제:** 해당 파티 채팅과 투표는 DB 외래 키의 CASCADE로 삭제된다. 다른 채팅방이나 전체 채팅으로 합쳐지지 않는다.

## API

기본 경로는 `/api/v1/trips/{tripId}/chat`이다. 모든 HTTP 요청은 기존 Bearer JWT 인증을 사용한다. 모든 경로에 선택 쿼리 `partyId={partyId}`를 동일하게 전달한다. 생략하면 전체 채팅이다. 응답은 기존 `SUCCESS/data` 봉투와 `Cache-Control: no-store`를 사용한다. ID와 revision은 BIGINT 정밀도를 보존하는 문자열이다.

| 메서드 | 경로 | 입력·용도 |
| --- | --- | --- |
| GET | `/messages?before={messageId}&limit=50&imagesOnly=false` | ID가 before보다 작은 과거 대화. imagesOnly=true는 이미지 첨부 메시지만 조회. limit은 1~100. 반환 items는 오름차순, nextCursor는 가장 오래된 반환 ID 또는 NULL |
| GET | `/messages/{messageId}` | 이벤트로 전달된 메시지 또는 투표의 최신 상태 |
| POST | `/messages` | `{ "text": "안녕하세요", "uploadId": null }`. 텍스트 또는 업로드 ID 중 하나 이상 필요 |
| POST | `/images` | multipart `file`. `{ id, url }` 반환 |
| POST | `/polls` | `{ "question": "어디로 갈까요?", "options": [{ "label": "카페", "placeId": "12" }, { "label": "해변", "placeId": null }], "closesAt": "2026-10-25T03:00:00Z", "allowMultiple": true }`. closesAt은 NULL 또는 생략 시 자동 마감 없음. allowMultiple은 생략 시 false |
| PUT | `/polls/{pollId}/vote` | 복수 선택: `{ "optionId": "31", "selected": true }`는 해당 항목 선택, false는 해당 항목만 취소. 단일 선택은 기존 `{ "optionId": "31" }` 및 NULL 취소도 지원 |
| PUT | `/polls/{pollId}/closure` | `{ "closed": true }` |

메시지와 투표 생성은 UUID `Idempotency-Key` 헤더가 필수다. 같은 사용자·작업·키·입력은 24시간 동안 같은 생성 대상을 반환하며 다른 입력에 키를 재사용하면 409를 반환한다. 투표 생성 재시도는 동일한 메시지 ID의 현재 투표 상태를 반환하므로 마감 후의 재시도도 중복 생성하지 않으며 마감 상태를 되돌리지 않는다. 프런트엔드는 응답을 받지 못한 요청의 키와 원래 마감 시각을 유지하고 성공한 뒤 제거한다. 투표 변경과 마감은 현재 상태를 지정하는 PUT이다.

투표 응답에는 `closesAt`(ISO 8601 또는 NULL), `serverNow`(서버의 현재 시각)가 포함된다. `closed`는 저장된 수동/자동 마감 여부와 마감 시각 경과를 함께 반영한다. `closesAt`의 최댓값은 기존 MySQL TIMESTAMP 범위에 맞춰 `2038-01-19T03:14:07Z`로 제한한다. 잘못된 마감 입력은 `INVALID_POLL_DEADLINE`(400), 기한 이후 참여 요청은 `POLL_CLOSED`(409)를 반환한다.

대표 오류는 `CHAT_NOT_FOUND`(파티 접근 불가), `INVALID_CHAT_IMAGE`, `PLACE_NOT_FOUND`, `POLL_CLOSED`, `IMAGE_UPLOAD_NOT_CONFIGURED`(503), `IMAGE_UPLOAD_FAILED`(502), `IMAGE_TOO_LARGE`(413)다. Cloudinary 미설정은 텍스트·투표 기능에는 영향을 주지 않는다.

## 실시간 전달

`/ws/chat`은 Spring WebSocket의 텍스트 프레임을 사용한다. 허용 웹 Origin은 HTTP와 같은 `users.allowed-origins`로 제한한다. 네이티브처럼 Origin이 없는 클라이언트도 프레임 안의 JWT로 인증한다. 토큰을 URL에 넣지 않는다.

연결 후 최초 프레임:

```json
{ "type": "subscribe", "token": "ACCESS_TOKEN", "tripId": "1", "partyId": null }
```

서버 프레임:

```json
{ "type": "ready" }
{ "type": "changed", "messageId": "123" }
{ "type": "heartbeat" }
```

트랜잭션 커밋 후에만 `changed`를 보낸다. 실제 메시지 내용은 다시 권한을 검증하는 HTTP GET으로 읽는다. heartbeat는 10초마다 인증을 재검사하고, 인증하지 않은 연결은 닫는다. 만료·접근권한 상실은 close code 1008이다.

클라이언트는 연결 전 HTTP 조회로 만료된 토큰을 갱신하고, 구독 확인 후 한 번 더 조회해 연결 사이에 놓친 변경을 복구한다. 연결이 끊기면 최대 30초까지 간격을 늘려 재접속하며, 15초마다 최근 대화와 화면에 로드한 과거 투표를 재조회한다. 메시지 ID로 중복을 제거하고 revision이 낮은 응답으로 새 투표 결과를 덮어쓰지 않는다. 채팅방을 전환하면 이전 방의 응답과 입력·이미지 초안을 분리한다.

## 저장과 운영 범위

채팅 푸시는 별도 발송 대기 테이블 2개와 Firebase Admin SDK를 사용한다. `014-push-outbox.sql`은 사용자 승인 후 연결된 DB에 적용 완료했다. 새 메시지 저장과 같은 트랜잭션에서 작성자를 제외한 수신 기기의 스냅샷을 기록하고, 커밋 후 기기별 발송을 준비한다. 공통 작업자가 권한·설정을 재검사한 뒤 FCM으로 보낸다. 자세한 서버 인증, 클라이언트 수신/열기 처리와 실제 검증 범위는 [채팅 푸시 구현](CHAT-PUSH-IMPLEMENTATION.md)을 참고한다.

복수 선택에는 `backend/db/migrations/013-chat-poll-multiple.sql`이 필요하다. `chat_poll.allow_multiple`(기본 false)을 추가하고 투표 내역의 기존 `(poll_id, user_id)` 고유 인덱스를 `(poll_id, user_id, option_id)`로 교체한다. 새 인덱스를 먼저 추가해 외래키에 필요한 인덱스를 유지하며, 기존 단일 선택 투표와 선택 내역은 보존한다. 단일 선택 제약은 서버의 여행 잠금 안에서 계속 검증한다. 복수 선택 API는 항목의 목표 상태를 지정하므로 중복 요청에도 표가 추가되지 않고 서로 다른 항목의 동시 선택을 덮어쓰지 않는다.

투표 응답에 `allowMultiple`, `myOptionIds`(내가 선택한 모든 항목 ID), `participantCount`(중복을 제외한 참여자 수)를 포함한다. 호환용 `myOptionId`는 단일 선택에서만 반환하고 복수 선택에서는 NULL이다. 복수 선택에서 선택 상태가 없는 구형 투표 요청은 `POLL_SELECTION_REQUIRED`(400)로 거절해 기존 선택이 지워지지 않도록 한다. 변경이 없는 선택·취소 요청은 revision을 올리거나 중복 이벤트를 발행하지 않는다.

`ChatPollExpiry`는 기본 1초 간격으로 만료된 투표를 최대 100개씩 확인한다. 투표별 트랜잭션에서 기존 여행 잠금을 먼저 잡고 조건부로 마감 상태와 메시지 revision을 갱신한 뒤 커밋 후 WebSocket으로 알린다. 수동 마감과 중복 작업은 같은 투표를 두 번 마감하지 않는다. 서버 중지 중 지난 마감도 재시작 후 처리하며, 스케줄러 지연 여부와 무관하게 투표 API가 시각을 검증한다. `chat.poll-expiry.delay-ms`로 확인 주기를 조정하고 테스트 프로필에서는 `chat.poll-expiry.enabled=false`로 자동 실행을 끈다. 서버가 여러 대면 같은 DB의 잠금으로 중복 마감은 방지하지만, 다른 인스턴스의 소켓으로 즉시 전달하려면 아래의 공유 이벤트 전달 구성이 필요하다.

추가 테이블은 `chat_image_upload`, `chat_message`, `chat_poll`, `chat_poll_option`, `chat_poll_vote`다. 이미지 바이너리는 DB에 넣지 않는다. 작성자 계정이 삭제되면 메시지는 작성자 ID를 NULL로 남기고, 그 사용자의 투표는 삭제한다. 생성·투표 변경은 기존 여행 잠금을 사용해 파티 변경·여행 종료와 함께 직렬화한다.

즉시 이벤트 전달은 한 백엔드 인스턴스 안에서 동작한다. 여러 인스턴스로 확장할 때는 Redis Pub/Sub 등의 공유 이벤트 전달을 추가해야 한다. 현재도 주기적 HTTP 재조회로 변경은 복구한다. 취소한 첨부나 업로드 후 DB 기록에 실패한 Cloudinary 파일의 자동 정리는 포함하지 않으며 운영 시 별도 보관·정리 정책이 필요하다.

## 검증

```powershell
# backend: H2 테스트 DB. 기존 MySQL에 연결하지 않는다.
./gradlew.bat test --no-daemon

# frontend
npm run typecheck
npm test
npm run build:web
npm run build:native
```

`ChatApiTests`는 실제 WebSocket 서버와 HTTP API로 채널 격리, 멤버십·토큰 무효화, Origin 제한, 중복 요청, 동시 투표, 장소 참조, 이미지 URL 저장과 종료한 여행 정책을 검사한다. Cloudinary 외부 호출은 테스트 대역을 사용하므로 실제 계정에 업로드하지 않는다. 프런트엔드 테스트는 응답 역전 병합, BIGINT 정밀도, 모든 API의 파티 범위, 401 갱신 후 multipart 파일 보존을 검사한다.

사진 일괄 전송 테스트는 선택 순서, 업로드 실패 시 중단, 메시지 응답 유실 후 업로드 ID 재사용, 채팅방 이탈 시 후속 전송 중단을 검사한다. 실제 기기의 사진 접근 권한·제한된 사진 목록·HEIC 변환은 Android/iOS 개발 빌드를 설치해 확인한다.

자동 마감 테스트는 마감 직전·정각·직후 요청, 잘못된 마감 입력과 시간대, 기한 이후 생성 재시도, 조기 수동 마감, 두 작업의 동시 마감, 파티별 커밋 후 WebSocket 알림과 무기한 투표 호환을 검증한다. 프런트엔드는 달력 날짜 검증, 서버 기준 카운트다운, 오래된 동일 revision 응답의 마감 상태 역전을 검사한다.

복수 선택 테스트는 항목별 선택·취소·동일 항목 중복 방지, 서로 다른 항목의 동시 선택, 반복 요청의 멱등성, 실제 참여 인원, 기존 단일 선택, 마감 시각과 파티 접근 제어를 검사한다. 프런트엔드 API 테스트는 생성 시 모드와 항목별 selected=false 값이 파티 범위를 유지해 전송되는지 확인한다.

구현 시 확인한 공식 문서: [Spring WebSocket API](https://docs.spring.io/spring-framework/reference/web/websocket/server.html), [Cloudinary 업로드와 인증 서명](https://cloudinary.com/documentation/upload_images), [Expo SDK 57 ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/), [MediaLibrary](https://docs.expo.dev/versions/v57.0.0/sdk/media-library/), [ImageManipulator](https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/).
