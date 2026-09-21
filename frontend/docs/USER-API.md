# 실제 USER/Auth 연결

기준 주소: `EXPO_PUBLIC_API_URL=http://localhost:8080/api`. 모든 경로는 `/v1`로 시작한다.
성공 `{code:"SUCCESS",data:...}`, 실패 `{code,message}`. IDs는 문자열, 시각은 UTC ISO8601.

| 화면/기능 | API |
| --- | --- |
| 회원가입 | POST /v1/users — name, email, password, consents |
| 로그인 | POST /v1/auth/login — email, password → accessToken, expiresIn(1800초) |
| 로그아웃 | POST /v1/auth/logout — 모든 기존 토큰 무효화 |
| 내 정보·이름·계좌 | GET/PATCH /v1/users/me |
| 비밀번호 변경 | PUT /v1/users/me/password |
| 탈퇴 | 비밀번호 로그인으로 재인증 → DELETE /v1/users/me |
| 푸시·위치 설정 | GET/PATCH /v1/users/me/settings |
| 동의 이력 | GET /v1/users/me/consents → data.consents 배열 |

HTTP 로그인·복원 후 OS 알림 권한을 확인하고 허용된 기기를 FCM 토큰으로 등록한다. 미결정 권한은 안내 후 사용자 버튼으로 요청하며 거절은 반복 요청하지 않는다. Firebase 설정이 필요하며 자세한 내용은 [알림 기기 등록](PUSH-DEVICE-REGISTRATION.md)을 참고한다. 계정의 푸시/위치 설정 스위치는 OS 권한과 별개다. 여행 이벤트 발송 서버는 아직 연결하지 않았다.

가입은 필수 약관 두 종류와 선택 마케팅을 명시적으로 제출한다. 버전은 현재 서버 기본값 1.0이다. 약관 전문/운영 정책은 별도 확정이 필요하다. 가입 응답에는 토큰이 없으므로 성공 후 로그인 화면으로 전환한다.

계좌 입력은 저장 후 지우고 본인의 서버 응답에 포함된 bankAccountNumber 전체 값을 표시한다. 기존 bankAccountNumberMasked 필드는 호환성을 위해 유지한다. 수정 요청에서 생략은 유지, null은 삭제다. 비밀번호·JWT·계좌 원문은 로컬 여행 저장소에 기록하지 않는다. 보호 API의 401은 POST /v1/auth/tokens/refresh로 재발급한 뒤 한 번 재시도한다. 재발급 실패 또는 ACCOUNT_UNAVAILABLE는 로그인 화면으로 돌려보낸다. 앱 시작 시 로그인 복원을 시도하며 웹은 HttpOnly 쿠키, 네이티브는 SecureStore를 사용한다. 자세한 계약은 [토큰 재발급 구현](../../docs/AUTH-REFRESH-2026-09-21.md)을 참고한다.

여행은 `server-user-{id}-workspace-v1` 키로 계정별 분리한다. 기존 mock의 workspace-v1과 local-session은 그대로 유지한다. 서버 여행/친구 API가 없어 실제 다른 회원 검색·초대·공유 여행 동기화는 지원하지 않는다. 로컬 여행 저장은 DB 백업이 아니다.

백엔드 설정: DB 연결 및 USER_JWT_SECRET(Base64 32바이트 이상), USER_BANK_ENCRYPTION_KEY(Base64 정확히 32바이트). 기존 암호화 키는 교체하지 않는다. 예전 BCrypt가 아닌 비밀번호는 인증되지 않으며 사용자 비밀번호를 임의 변경하지 않는다. 계정 복구/이메일 인증/소셜 로그인은 아직 없다.
