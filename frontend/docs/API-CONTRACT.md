# 연결할 API 계약

이 문서는 새 프런트엔드의 **제안 계약**이다. 저장소의 현재 Java 백엔드는 이 계약을 구현하지 않았으며 `http` 모드로 바꾸기만 해서는 전체 서비스가 동작하지 않는다.

`.env.local`에서 `EXPO_PUBLIC_DATA_SOURCE=http`, `EXPO_PUBLIC_API_URL=https://your-server.example/api`를 설정하고 Metro를 재시작한다. Android 에뮬레이터에서 PC 서버는 일반적으로 `10.0.2.2`, 실기기에서는 접근 가능한 PC 주소를 사용한다. 운영 서버는 HTTPS를 사용한다. 공개 환경변수에 API 비밀 키를 넣지 않는다.

## HTTP 형식

- JSON UTF-8, 인증 후 `Authorization: Bearer <access token>`.
- 날짜 `YYYY-MM-DD`, 시각 `HH:MM`, 이벤트 시각 ISO 8601 UTC, 금액 정수 원.
- 오류 응답: `{ "message": "사용자에게 표시할 오류" }`, 적절한 400/401/403/404/409/500 상태 코드.
- 15초 제한, 실패 시 입력 보존. 변경 요청은 자동 재시도하지 않는다. 타임아웃 후에는 서버에서 저장됐을 수 있으므로 먼저 재조회한다.
- TypeScript 스키마의 단일 기준: `src/domain/models.ts`.

| 요청                  | 본문                        | 응답                                       |
| --------------------- | --------------------------- | ------------------------------------------ |
| POST `/auth/login`    | `{ email, password }`       | `Session` (`{ user, token }`)              |
| POST `/auth/register` | `{ name, email, password }` | `Session`                                  |
| POST `/auth/logout`   | 없음                        | 204                                        |
| GET `/workspace`      | 없음                        | 로그인 사용자가 볼 수 있는 `Workspace`     |
| POST `/commands`      | `{ commandId, command }`    | 트랜잭션 커밋 후 해당 사용자의 `Workspace` |

`Workspace`는 `version:1`, `users`, `trips`, `friendships`, `notifications`를 포함한다. 사용자 디렉터리는 검색/초대가 허용된 공개 프로필과 친구/여행 멤버만 제공한다. 비밀번호나 다른 사용자의 알림은 포함하지 않는다. 여행도 로그인 사용자의 참여 여행만 반환한다.

## 변경 명령

```json
{
  "commandId": "client-generated-unique-id",
  "command": {
    "type": "item.save",
    "tripId": "busan",
    "collection": "expenses",
    "item": {
      "id": "expense-id",
      "title": "함께 먹은 점심",
      "amount": 48000,
      "date": "2026-09-19",
      "payerId": "jiwoo",
      "shares": { "jiwoo": 24000, "seoyeon": 24000 },
      "partyId": null,
      "note": ""
    }
  }
}
```

| type                | 필드와 의미                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| `trip.create`       | `input: TripInput`, 서버가 여행 ID·여행장·초대 코드 생성                  |
| `trip.update`       | `tripId`, `input` 여행 정보+archived                                      |
| `trip.invite`       | `tripId`, `userId`, 여행장 직접 초대                                      |
| `trip.join`         | `code`, 유효한 초대 코드로 참여                                           |
| `friend.add`        | `userId`, 현재 로컬은 양방향 친구 등록; 실제 서버의 수락 방식은 별도 구현 |
| `item.save`         | `tripId`, `collection`, `item`; ID로 생성/수정                            |
| `item.delete`       | `tripId`, `collection`, `itemId`                                          |
| `notification.read` | `notificationId`                                                          |
| `transfer.confirm`  | `tripId`, `transferKey`, 수동 송금 완료 표시 토글                         |

collection은 `parties`, `places`, `agenda`, `expenses`, `checklist`, `notices`, `messages`. 메시지는 추가만 지원한다. 서버는 actor를 token에서 얻고 전달받은 authorId를 신뢰하지 않는다. 수정 시 기존 공지 작성자와 작성 시각을 보존한다.

서버는 commandId별 중복 처리를 보장하고, 권한·참조·정산 검증과 알림 생성을 한 트랜잭션으로 커밋해야 한다. 동시 편집 시 revision/409 충돌 규칙을 추가하고 클라이언트도 해당 계약에 맞춰 확장한다. 현재 토큰 갱신과 자동 재시도는 구현하지 않았다.

기존 REST API를 유지하려면 `HttpTravelRepository`의 내부 요청 매핑만 바꾸면 된다. 예: `item.save + expenses`를 `POST/PATCH /trips/:id/expenses`로 분배한다. Repository의 반환값은 Workspace로 유지하므로 화면을 바꿀 필요가 없다.

## 후속 서비스

지도 제공자는 별도 PlaceSearch/Map 인터페이스, 영수증 OCR은 업로드→인식 결과 검토→기존 Expense 저장, 실시간 메시지/알림은 WebSocket 또는 SSE→재조회/상태 반영, GPS는 명시적 공유 시작·중지와 위치 갱신 시각으로 추가한다. 현재 어댑터가 이런 서비스를 호출한다고 가정하지 않는다.
