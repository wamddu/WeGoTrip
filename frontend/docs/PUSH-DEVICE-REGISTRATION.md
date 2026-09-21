# 로그인 후 알림 권한·기기 등록

## 구현된 흐름

HTTP 로그인 성공 및 저장된 로그인 복원 후 알림 권한을 확인한다. mock 모드에는 적용하지 않는다.

| 상태 | 처리 |
| --- | --- |
| 아직 결정하지 않음 | 안내 창 → 사용자가 ‘알림 허용’을 누르면 OS/브라우저 권한 요청 |
| 이미 허용 | 실제 FCM 토큰을 받아 POST /api/v1/users/me/devices 등록·갱신 |
| 거절 | 다시 요청하지 않고 내 정보에서 설정 안내 |
| ‘나중에’ 선택 | 자동 안내를 반복하지 않음. 내 정보의 ‘알림 허용’으로 다시 진행 가능 |
| 설정 없음·미지원 환경 | 기기 등록만 건너뜀. 로그인과 여행 기능 유지 |
| 등록 실패 | 로그인 유지. 내 정보에서 재시도 가능 |

기기 등록 요청은 `{fcmToken, deviceType, deviceId?}`다. deviceType은 ANDROID/IOS/WEB이며 clientType과 별개다. 토큰은 플랫폼 SDK에서 발급받고 임의 문자열이나 Expo Push Token을 보내지 않는다. iOS에서도 APNs 토큰을 fcmToken으로 대신 보내지 않고 Firebase Messaging의 FCM 토큰을 사용한다.

서버가 반환한 deviceId만 API 주소·계정별로 저장한다. 같은 로그인에서 토큰이 같으면 중복 호출하지 않고, 새 로그인에서는 서버와 재동기화한다. 네이티브 토큰 변경 이벤트와 앱 복귀, 웹 창 포커스 복귀 시 토큰/권한을 확인한다. 서버 기기 ID가 404이면 재등록하고, 다른 계정 소유 토큰 충돌(409)은 강제로 빼앗지 않는다.

로그아웃은 진행 중인 등록 요청을 마친 뒤 현재 기기를 서버에서 삭제하고 FCM 토큰을 폐기한다. 서버 삭제/SDK 폐기에 실패해도 로그아웃은 진행한다. 네트워크 오류로 삭제하지 못한 서버 행은 남을 수 있으므로 향후 발송 서버에서도 FCM의 무효 토큰 응답을 처리해야 한다. 세션이 이미 만료된 경우 서버의 인증된 기기 삭제는 생략하고 SDK 토큰을 폐기한다.

기기의 OS 권한과 계정의 `pushNotificationEnabled` 설정은 별개다. 자동 기기 등록은 사용자가 저장한 계정 전체의 알림 설정을 덮어쓰지 않는다. 실제 발송은 향후 발송 서버가 계정 설정과 유효한 기기를 함께 확인해야 한다. 여행 이벤트를 푸시로 발송하는 서버 로직은 이번 범위에 포함하지 않는다.

## Firebase 설정 받기

[Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 만든다. ‘프로젝트 설정 → 일반 → 내 앱’에 대상 앱을 추가한다.

### Android

1. Android 앱을 추가한다. 현재 패키지 이름은 `com.jeongheaum.frontend`다.
2. `google-services.json`을 내려받아 `frontend/google-services.json`에 둔다.
3. 개발 빌드를 다시 생성·설치한다. 이미 설치된 빌드에는 새 Firebase 네이티브 모듈이 없다.

다른 파일 위치를 쓰려면 `GOOGLE_SERVICES_JSON`에 경로를 지정한다. 패키지 이름이 설정 파일과 일치해야 한다.

### iOS

1. iOS 앱을 추가하고 실제 Bundle ID를 입력한다.
2. `GoogleService-Info.plist`를 `frontend/GoogleService-Info.plist`에 둔다.
3. `IOS_BUNDLE_IDENTIFIER`를 Firebase에 등록한 Bundle ID로 설정한다.
4. Firebase 프로젝트 설정의 Cloud Messaging에서 Apple Developer의 APNs 인증 키를 연결한다.
5. macOS/Xcode 또는 EAS에서 네이티브 앱을 다시 빌드한다.

다른 파일 위치는 `GOOGLE_SERVICES_PLIST`로 지정한다. Apple APNs 비밀키는 소스/EXPO_PUBLIC 환경 변수에 넣지 않는다.

### 웹

Firebase에 웹 앱을 추가하고 설정 객체의 값을 `frontend/.env.local`에 넣는다.

```dotenv
EXPO_PUBLIC_FIREBASE_API_KEY=웹_설정의_apiKey
EXPO_PUBLIC_FIREBASE_PROJECT_ID=projectId
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=messagingSenderId
EXPO_PUBLIC_FIREBASE_APP_ID=appId
EXPO_PUBLIC_FIREBASE_VAPID_KEY=웹_푸시_인증서의_공개키
```

VAPID 공개키는 ‘프로젝트 설정 → Cloud Messaging → 웹 푸시 인증서’에서 생성한다. 이 값들은 공개 클라이언트 설정이며 서버 서비스 계정의 private_key와 다르다.

웹에서는 HTTPS 또는 localhost, 알림·Push API를 지원하는 브라우저가 필요하다. `public/firebase-messaging-sw.js`를 사이트 루트에서 제공한다. 서비스 워커는 Firebase 공식 CDN의 버전 고정 SDK를 로드하므로 배포 CSP/네트워크 정책에서 해당 로드를 허용해야 한다. 현재 서비스 워커는 루트 배포를 기준으로 한다.

설정 후 Metro/웹 빌드를 다시 시작한다. 웹에서 이미 거절한 권한은 주소창의 사이트 설정에서 변경한다. Firebase 웹 설정을 모바일용 google-services.json 대신 사용하지 않는다.

## 개발 환경 및 검증

- Expo Go에는 React Native Firebase 모듈이 없어 기기 등록을 건너뛴다. 네이티브 개발 빌드가 필요하다.
- `app.config.js`가 설정 파일 존재 여부에 따라 Firebase 플러그인과 플랫폼 활성화 여부를 구성한다. 설정 파일은 Git에서 제외했다.
- 실제 Firebase 프로젝트 설정과 기기가 없는 상태에서는 SDK의 토큰 발급·OS 권한 창·실제 수신을 검증했다고 보지 않는다.
- 자동 테스트는 권한 요청 전 등록 금지, 거절/안내 반복 방지, 토큰 갱신, 실패 재시도, 권한 철회, 로그아웃 경합, 다른 계정 토큰 충돌을 검증한다.

2026-09-21 검증: typecheck, 프론트 테스트 42개, web/Android/iOS export 통과. 전달된 Android 설정 파일의 패키지 일치 및 Expo 네이티브 구성 검사도 통과했다. iOS/웹 Firebase 설정은 아직 없으며, 연결된 Android 기기·에뮬레이터가 없어 실제 권한 창·FCM 발급·서버 자동 등록·수신은 실기기에서 추가 검증해야 한다. export는 JavaScript 번들 검사로 APK/IPA 설치 빌드 성공을 의미하지 않는다.

참고: [React Native Firebase 설정](https://rnfirebase.io/), [Expo Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/), [Firebase 웹 푸시 설정](https://firebase.google.com/docs/cloud-messaging/web/get-started).
