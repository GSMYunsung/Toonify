# 프론트엔드 개발자 — 업무 지시서 (인스타툰 알림 서비스)

> 이 파일은 AI 직원의 업무 매뉴얼입니다
> 한 번 만들어두면 매번 이걸 읽고 일합니다

> 사용자가 인스타툰의 다음 편을 놓치지 않도록 돕는 React Native 앱 서비스를 구축합니다.

---

## 핵심 규칙

1. 사용자 언어 사용 — 개발 용어보다는 기능 위주로 설명 (예: 'FCM 발송' 대신 '알림 보내기')

2. 모바일 앱 (React Native + Expo) — iOS/Android 모두 지원

3. 플랜 먼저 — 로직이나 UI를 짜기 전에 사용자 흐름(User Flow)부터 보고

4. 실시간 반영 — 수정 요청 시 즉시 코드에 반영

5. 보안 철저 — 실제 API 키/시크릿은 `.env.local`(로컬)·EAS Secrets(빌드)에만 두고 `EXPO_PUBLIC_*` 환경변수로 주입, 레포에 값 자체를 커밋하지 않음. `config.js`는 `process.env` 참조만 담아 커밋 가능(실제 키 없음). `google-services.json`도 Firebase 설계상 앱 식별자만 담아 커밋 가능한 파일 — 보안은 Firebase Security Rules/API 키 제한이 담당 (AGENTS.md Part 4 `#3` 참고)

6. JS 변경만 → OTA 배포 (`eas update --channel production`), 네이티브 변경 → 새 빌드 필요

7. OTA 배포 전 자가검증 필수 — 아래 순서 반드시 지킬 것
   - 변경된 로직을 직접 추적하며 엣지 케이스 확인 (오탐/누락 시나리오)
   - 새 기능·버그픽스가 있으면 `scripts/test-check-toons.js`에 테스트 케이스 추가
   - AGENTS.md의 "Part 4 — 트러블슈팅 로그"에 해결한 문제 기록
   - 검증 완료 후 OTA 배포
   - 변경사항 리드미 추가 및 수정

8. 로직은 한 번만 작성, 재사용 필수
   - 작업 시작 전 기존에 동일하거나 유사한 함수·로직이 있는지 먼저 확인할 것
   - 이미 선언된 함수가 있으면 새로 만들지 말고 반드시 그것을 가져다 씀
   - 같은 로직을 두 곳에 따로 작성하거나 복붙하는 것 금지
   - 로직을 수정할 때 한 곳만 고치고 다른 곳을 빠뜨리는 것 금지
   - 앱(`src/`)과 서버(`scripts/`)가 함께 쓰는 로직은 `src/utils/`에 공유 파일로 분리하고
     양쪽이 import/require해서 사용
   - 새 공통 로직이 생기면 즉시 공유 파일로 추출할 것

---

## 기술 스택

| 항목           | 내용                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| 프레임워크     | React Native (Expo SDK 54)                                             |
| 로컬 저장      | AsyncStorage (`@react-native-async-storage/async-storage`)             |
| 원격 저장/동기 | Supabase (PostgreSQL) — `toons`, `push_tokens` 테이블                  |
| 알림           | `expo-notifications` + Expo Push API (서버→기기 FCM/APNs)              |
| 인스타 API     | hasdata (`https://api.hasdata.com/scrape/instagram/profile`)           |
| OCR            | `ocr.space` API (앱 + 서버 공통, 무료 25,000회/월)                     |
| 서버 배치      | GitHub Actions cron (3시간마다) — `scripts/check-toons.js`             |
| 제스처         | `react-native-gesture-handler` (스와이프 삭제)                         |
| 빌드/배포      | EAS Build (production 채널) + EAS Update (OTA)                         |
| API 키 관리    | `.env.local` → Metro 인라인 (로컬) / EAS Secrets → Metro 인라인 (빌드) |

---

## API 키 흐름

```
로컬 개발:   .env.local  →  EXPO_PUBLIC_*  →  config.js export
EAS 빌드:    EAS Secrets →  EXPO_PUBLIC_*  →  config.js export (번들에 인라인)
```

- `EXPO_PUBLIC_HASDATA_KEY` — hasdata API 키
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase 프로젝트 URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- 환경변수 변경 시 → OTA 재배포 또는 새 빌드 필요 (번들에 인라인되므로)

---

## 파일 구조

```
toon-notifier-app/
├── App.js                        ← 루트: 알림 핸들러 + GestureHandlerRootView + 푸시 토큰 등록
├── app.config.js                 ← Expo 설정 (OTA: ON_LOAD, runtimeVersion: appVersion)
├── eas.json                      ← EAS 빌드 프로필 (production: autoIncrement)
├── config.js                     ← EXPO_PUBLIC_* 환경변수 참조만 export (실제 키 없음, 커밋 가능)
├── scripts/
│   ├── check-toons.js            ← GitHub Actions 배치: 에피소드 감지 + 푸시 알림 발송
│   └── test-check-toons.js       ← 매칭·필터링 로직 테스트 (29개 케이스)
└── src/
    ├── constants/
    │   └── urls.js               ← API Base URL 상수 (HASDATA_BASE_URL 등)
    ├── screens/
    │   └── HomeScreen.js         ← 메인 화면 (리스트 + 새로고침 + AppState 복귀 처리)
    ├── components/
    │   ├── ToonCard.js           ← 카드 UI (스와이프 삭제, 에피소드 목록 토글)
    │   ├── CardShape.js          ← 카드 좌측 Shape 아이콘 (SVG, ID 기반 결정론적 생성)
    │   ├── AddToonModal.js       ← 툰 추가/수정 바텀시트 (링크 붙여넣기 → 자동 파싱)
    │   └── EmptyState.js         ← 빈 상태 화면
    ├── services/
    │   ├── toon-service.js       ← barrel re-export (toon-store + check-service + notifications)
    │   ├── toon-store.js         ← AsyncStorage CRUD + Supabase 동기화
    │   ├── check-service.js      ← 에피소드 감지 로직 (checkToon, checkAllToons)
    │   ├── notifications.js      ← 로컬 알림 전송 + 권한 요청
    │   ├── instagram-api.js      ← hasdata API 호출 및 응답 파싱
    │   ├── ocr-service.js        ← OCR (ocr.space API, 앱+서버 공통)
    │   └── supabase.js           ← Supabase 클라이언트
    ├── utils/
    │   └── matchingUtils.js      ← 시리즈 키워드 매칭 공통 로직 (앱+서버 공유, CommonJS)
    ├── hooks/
    │   └── useKeywordDetector.js ← 화/편/ep 숫자 추출 정규식 + 완결 감지
    ├── context/
    │   └── ThemeContext.js       ← 다크/라이트 테마
    └── theme/
        └── index.js              ← 테마 토큰 (색상, 폰트)
```

---

## 서비스 레이어 구조

```
toon-service.js (barrel)
    ↓ re-exports
toon-store.js          — getToons, addToon, updateToon, deleteToon, advanceEpisode,
                          syncFromSupabase, applyNotificationUpdates ...
check-service.js       — checkToon, checkAllToons, buildEpisodeHistory, buildUnreadPosts
notifications.js       — sendLocalNotification, requestNotificationPermission
```

- `toon-service`에서 import하면 위 3개를 모두 쓸 수 있음 (기존 import 경로 호환)
- `checkToon`은 앱 내 수동 새로고침용, 서버 배치(`check-toons.js`)와 별개

---

## 알림 흐름

```
GitHub Actions (3시간마다)
    → scripts/check-toons.js
        → hasdata API로 새 포스트 확인 (last_post_id 기준 중복 제거)
        → 캡션에서 화수 추출 (서버 OCR: ocr.space API)
        → 새 화수 감지 시 Supabase 업데이트 + Expo Push API로 알림 발송
            → 알림 payload: { updates: [{ toonId, unreadPosts, isComplete }] }

앱 (알림 수신)
    → applyNotificationUpdates(updates) — 로컬 AsyncStorage 즉시 반영
    → loadToons() — 화면 업데이트
```

---

## Supabase 테이블

**`toons`** — 서버와 앱 간 에피소드 상태 동기화

```
id, username, series_name, last_episode, read_episode,
has_new_episode, unread_posts (JSON), is_complete,
device_id, last_post_id, last_post_url, updated_at
```

**`push_tokens`** — 기기별 Expo 푸시 토큰

```
token, platform, device_id
```

---

## API 응답 구조 (hasdata)

```json
{
  "latestPosts": [
    {
      "id": "...",
      "shortcode": "...",
      "caption": "시리즈명 5화",
      "displayUrl": "https://...",
      "url": "https://www.instagram.com/p/.../",
      "timestamp": "2026-05-16T07:34:58.000Z"
    }
  ]
}
```

---

## 데이터 모델 (toon 객체 — AsyncStorage)

```js
{
  id: string,              // UUID
  username: string,        // 인스타 계정명
  seriesName: string,      // 시리즈 이름 (키워드 매칭에 사용)
  lastEpisode: number,     // 가장 최근 감지된 화수
  readEpisode: number,     // 사용자가 읽음 처리한 화수
  hasNewEpisode: bool,     // 새 에피소드 여부
  isComplete: bool,        // 완결 여부
  pendingComplete: bool,   // 완결이지만 아직 안 읽은 화수 있음
  unreadPosts: [{ episode, url }],    // 읽지 않은 화수 목록
  episodeHistory: [{ episode, url }], // 읽은 화수 히스토리
  lastPostId: string,      // 마지막으로 처리한 포스트 ID (중복 감지용)
  lastThumbnailUrl: string | null,
  lastPostUrl: string,
  undetectable: bool,      // 캡션에서 키워드 감지 불가 (직접 확인 필요)
  addedAt: string,         // ISO 날짜
  updatedAt: string,
}
```

---

## 에피소드 라벨 규칙 (ToonCard 메타 텍스트)

| 상태             | 표시                        |
| ---------------- | --------------------------- |
| 새 에피소드 있음 | `n화까지 나옴 / n화까지 봄` |
| 읽음 처리 후     | `n화까지 봄`                |
| 등록만 한 경우   | `아직 읽은 편 없음`         |

---

## 기능 1: 인스타툰 관리

- 툰 추가: 인스타 게시물 링크 붙여넣기 → 계정명/시리즈명/화수 자동 파싱
- 삭제: 카드를 왼쪽으로 스와이프
- 수정: 카드 길게 누르기 → 수정 모달
- 읽음 처리: 에피소드 목록 → 화수 탭 → 인스타 열림 + 읽음 표시

## 기능 2: 에피소드 감지 로직 (앱 내 / 서버 공통)

1. hasdata API로 `latestPosts` 가져오기 (최신 12개)
2. `last_post_id` 기준으로 이미 처리한 포스트 필터링
3. `seriesName` 키워드가 `caption`에 포함되는지 확인
4. `extractEpisodeNumber(caption)` 으로 화수 추출 (`n화`, `n편`, `ep.n`, `#n`)
5. 캡션에서 못 찾으면 → OCR 폴백 (앱·서버 모두 ocr.space API)
6. 새 화수 감지 시 → `hasNewEpisode: true` + 알림 전송

## 기능 3: 자동 확인

- **서버**: GitHub Actions cron 3시간마다 → 푸시 알림으로 앱에 전달
- **수동**: 아래로 당겨서 새로고침 (`RefreshControl`) → `checkAllToons(forceAll: true)`
- 완결 툰 / `undetectable` 툰은 자동 확인 제외

## 기능 4: 빌드 및 배포

```bash
# JS만 변경 → OTA 배포 (즉시 적용, 새 빌드 불필요)
eas update --channel production --message "변경 내용"

# 네이티브 변경 또는 OTA 설정 변경 → 새 빌드
eas build --platform ios --profile production
eas submit --platform ios --latest
```

- OTA 정책: `checkAutomatically: "ON_LOAD"` — 앱 실행마다 자동 확인 후 다음 실행 때 적용
- 빌드 번호: EAS `autoIncrement: true` 자동 관리 (현재 빌드 13)

## 기능 5: 앱 로컬 실행 방법

```bash
cd /Users/choeyunseong/프로젝트/toon-notifier-app
npx expo start
```

> OCR은 ocr.space API를 사용하므로 Expo Go에서도 동작함

---

## 작업 톤

- 진행 상황을 개발 로그가 아닌 "사용자 경험 보고서" 형식으로 전달.
- "로직을 짰습니다" 대신 "이제 다음 편이 올라오면 바로 알려드릴 준비가 됐습니다"라고 말하기.
- 복잡한 데이터 구조 대신 눈에 보이는 리스트와 버튼 위주로 설명.
