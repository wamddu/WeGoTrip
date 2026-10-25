# 투표 생성 시 복수 선택 설정 변경안

상태: 2026-10-24 사용자가 “DB 변경 승인”으로 승인한 뒤 구현 및 실제 WeGoTrip DB 적용 완료. 적용 전 두 테이블의 스키마는 `tmp/chat-diagnostics/schema-before-013-1792818737223.sql`에 보관했다. 기존 선택 내역 2개와 외래키 4개가 그대로 보존됐는지 검증했다.

## 화면과 동작

- 투표 생성 화면에 기본 OFF인 작은 `복수 선택` 토글을 추가한다.
- OFF는 기존의 1인 1표다. ON이면 항목 1과 항목 2에 각각 한 표씩 선택할 수 있다.
- 같은 항목에 중복 투표할 수 없다. 다시 누르면 그 항목의 표만 취소하고 다른 선택은 유지한다.
- 생성 후 단일/복수 선택 모드는 고정한다. 장소 연결과 자동 마감은 두 모드에서 모두 제공한다.
- 복수 선택은 체크박스로 표시한다. 참여 인원은 서로 다른 참여자 수로 집계하고, 각 항목의 비율은 참여 인원을 기준으로 표시한다. 한 사람이 여러 항목을 선택해도 참여 인원은 1명이다.

## 승인이 필요한 DB 변경

현재 `chat_poll_vote`의 `UNIQUE (poll_id, user_id)`는 한 사용자가 같은 투표에 한 행만 저장하도록 강제하므로 복수 선택을 저장할 수 없다.

1. `chat_poll`에 `allow_multiple BOOLEAN NOT NULL DEFAULT FALSE`를 추가한다. 기존 투표는 단일 선택을 유지한다.
2. `chat_poll_vote`에 `UNIQUE (poll_id, user_id, option_id)`를 추가한다. 같은 항목에 두 번 투표하는 것을 DB에서도 막는다.
3. 기존의 `UNIQUE (poll_id, user_id)`만 제거한다. 새 인덱스를 먼저 추가해 기존 외래키에 필요한 인덱스를 유지한다. 실제 인덱스 이름은 메타데이터로 확인한다.

검토용 SQL 핵심은 다음과 같다. 적용 파일은 컬럼·인덱스 존재 여부를 확인해 재실행할 수 있도록 작성한다.

```sql
ALTER TABLE chat_poll
  ADD COLUMN allow_multiple BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX uq_chat_poll_vote_option
  ON chat_poll_vote(poll_id, user_id, option_id);

-- 기존의 (poll_id, user_id) 고유 인덱스 이름을 확인한 뒤 해당 인덱스만 제거한다.
-- ALTER TABLE chat_poll_vote DROP INDEX `<확인한 기존 인덱스 이름>`;
```

기존 질문, 항목, 선택 내역과 외래키는 유지한다. 기존 단일 선택 제한은 서버의 여행 잠금과 검증으로 계속 보장한다. 실제 DB 변경 전 두 테이블의 스키마를 보관하고, 변경 후 기존 투표 내역의 보존과 새 제약을 확인한다. DDL은 MySQL에서 암시적으로 커밋된다.

## API와 검증

- 생성 입력에 선택적인 `allowMultiple`을 추가한다. 생략하면 false다.
- 응답에 `allowMultiple`, `myOptionIds`, `participantCount`를 추가한다. 기존 단일 선택용 `myOptionId`는 호환을 위해 유지한다.
- 복수 선택 요청은 `{ "optionId": "31", "selected": true }`처럼 해당 항목의 목표 선택 상태를 지정한다. 반복 요청에도 중복 표가 생기지 않고, 서로 다른 항목의 동시 선택을 덮어쓰지 않는다.
- 단일 선택의 기존 `{ "optionId": "31" }` 및 `{ "optionId": null }` 요청은 유지한다.
- 별도 H2 DB에서 단일/복수 모드, 항목별 중복·취소·동시 선택, 참여 인원, 마감 후 차단, 채팅방 권한, 생성 멱등성을 검증한다. 실제 DB에는 승인 후에만 적용한다.

완료 검증: 백엔드 전체 129개 테스트(채팅 API 19개 포함), 프런트엔드 155개 테스트, TypeScript 검사, 웹·Android·iOS 번들 생성 통과. 마이그레이션은 `backend/db/migrations/013-chat-poll-multiple.sql`이며 실제 적용 후 항목별 고유 제약과 기존 선택 내역·외래키 보존을 확인했다.
