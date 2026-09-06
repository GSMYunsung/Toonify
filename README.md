# Toonify — 인스타툰 알림 서비스

인스타그램에 연재 중인 웹툰(인스타툰)의 새 에피소드를 자동으로 감지하고 푸시 알림으로 알려주는 iOS/Android 앱.

---

## 만든 이유

### 문제

인스타그램을 둘러보다 재미있는 인스타툰을 우연히 발견하는 경우가 있다.
하지만 다음 편을 보려면 **직접 해당 계정을 찾아가서 새 게시물이 올라왔는지 확인해야 한다.**

- 인스타그램 알림은 팔로우한 모든 계정의 게시물이 섞여서 올라오기 때문에 툰 업데이트만 골라서 받기 어렵다
- 여러 작가를 팔로우하면 새 편이 언제 올라왔는지 놓치기 쉽다
- 매번 계정에 들어가서 확인하는 것이 번거롭고 결국 잊어버리게 된다

### 해결

이 앱은 관심 있는 인스타툰 작가 계정을 등록해두면 **새 에피소드가 올라오면 푸시 알림으로 알려준다.**

| 문제 | 해결 |
| ---- | ---- |
| 새 편을 놓치지 않으려면 직접 계정을 방문해야 함 | GitHub Actions가 3시간마다 자동으로 체크해 알림 전송 |
| 인스타그램 일반 알림에 섞여 툰 업데이트를 구분하기 어려움 | 시리즈 이름 키워드 매칭으로 인스타툰 게시물만 필터링 |
| 화수가 캡션에 없고 이미지에만 적혀있는 경우 감지 불가 | OCR로 이미지에서 화수 직접 인식 |
| 몇 화까지 읽었는지 기억하기 어려움 | 읽음 처리 기능으로 진도 관리 |

---

## 프로젝트 개요

| 항목        | 내용                       |
| ----------- | -------------------------- |
| 플랫폼      | React Native (Expo SDK 54) |
| 지원 기기   | iOS / Android              |
| 버전        | 1.0.1                      |

---

## 서비스 구조

```
📱 앱 (Expo)
  │  앱 실행 시 Expo push token → Supabase 저장
  │  툰 추가/삭제/읽음 처리 → Supabase 동기화
  ▼
🗄️ Supabase (온라인 DB)
  │  toons 테이블: 등록된 툰 목록
  │  push_tokens 테이블: 디바이스 푸시 토큰
  ▼
⚙️ GitHub Actions (3시간마다 자동 실행)
  │  Supabase에서 툰 목록 읽기
  │  인스타 API로 새 편 확인
  │  새 편 발견 시 Expo Push API로 알림 전송
  ▼
📳 폰에 푸시 알림 도착
```

---

## 기능 요약

- 인스타툰 계정 등록 / 삭제 (스와이프 삭제)
- 캡션 키워드 매칭으로 새 에피소드 자동 감지 — 최신 12개 게시물 최신순 검사
- 이미 읽은 화수 도달 시 즉시 중단 (OCR 호출 최소화)
- 이미지 OCR을 통한 화수 인식 (캡션에 화수가 없을 때) — ocr.space API (앱·서버 공통)
- OCR 결과 AsyncStorage 캐싱 (post.id 기반 — 동일 포스트 재호출 방지)
- 3주 이상 포스트 없으면 완결로 자동 처리
- 당겨서 수동 새로고침 (`RefreshControl`) → `checkAllToons`
- 새 에피소드 복수 발견 시 `3화, 4화가 추가되었어요` 형식 알림
- 카드 탭 → 에피소드 목록 아코디언 펼치기 (읽은 화 + 신규화 모두 표시)
- 에피소드 탭에서 화수 선택 → 해당 인스타 게시물로 바로 이동
- 읽음 처리 시 `readEpisode` 자동 진행
- 직접 확인 배지 — 최신 12개 안에 시리즈 게시물 없을 때 표시
- 툰 추가: 링크 붙여넣기 → 계정명/시리즈명/화수 자동 채움 (링크 먼저 필수)
- 타이틀 옆 ⓘ 버튼 → 감지 방식 안내 팝업
- 라이트 / 다크 모드 (시스템 기본값 + 수동 전환)

---

## 사용 API / 서비스

### 1. hasdata — 인스타그램 스크래핑

| 항목       | 내용                                                                     |
| ---------- | ------------------------------------------------------------------------ |
| 용도       | 인스타그램 계정의 최신 게시물 목록 가져오기                              |
| 엔드포인트 | `GET https://api.hasdata.com/scrape/instagram/profile?handle={username}` |
| 인증       | `x-api-key` 헤더                                                         |
| 응답 필드  | `id`, `caption`, `displayUrl`, `timestamp`, `url`                        |
| 크레딧     | 호출당 10 크레딧 소모                                                    |
| 사용 파일  | `src/services/instagram-api.js`, `scripts/check-toons.js`                |

**응답 예시:**

```json
{
  "latestPosts": [
    {
      "id": "...",
      "caption": "인스타툰 47화",
      "displayUrl": "https://...",
      "timestamp": "2026-05-16T07:34:58.000Z",
      "url": "https://www.instagram.com/p/.../"
    }
  ]
}
```

---

### 2. OCR.space — 이미지 텍스트 인식

| 항목       | 내용                                                       |
| ---------- | ---------------------------------------------------------- |
| 용도       | 캡션에 화수가 없을 때 게시물 이미지에서 텍스트 추출        |
| 엔드포인트 | `GET https://api.ocr.space/parse/imageurl`                 |
| 인증       | `apikey` 쿼리 파라미터                                     |
| 설정       | `language=kor`, `OCREngine=2`, `isOverlayRequired=false`   |
| 무료 한도  | 25,000회 / 월                                              |
| 사용 파일  | `src/services/ocr-service.js`, `scripts/check-toons.js`   |

> 앱과 서버 모두 동일한 ocr.space API를 사용하며, 앱에서는 `post.id` 기반 AsyncStorage 캐시를 통해 동일 포스트에 대한 반복 호출을 방지한다. 같은 포스트에 대한 동시 요청은 in-flight Promise 재사용(single-flight)으로 중복 API 호출을 막는다(서버는 캐시/dedup 없이 매번 새로 호출 — `filterNewPosts`가 상위에서 이미 처리한 포스트를 걸러줌).

---

### 3. Supabase — 온라인 데이터베이스

| 항목      | 내용                                          |
| --------- | --------------------------------------------- |
| 용도      | 툰 목록 및 디바이스 push token 저장           |
| 테이블    | `toons`, `push_tokens`                        |
| 사용 파일 | `src/services/supabase.js`, `scripts/check-toons.js` |

### 4. Expo Push API — 푸시 알림 전송

| 항목       | 내용                                        |
| ---------- | ------------------------------------------- |
| 용도       | GitHub Actions에서 디바이스로 알림 전송     |
| 엔드포인트 | `POST https://exp.host/--/api/v2/push/send` |
| 인증       | 불필요 (Expo 토큰 기반)                     |
| 비용       | 무료                                        |

---

## 기술 스택

| 분류                | 라이브러리 / 서비스                                    |
| ------------------- | ------------------------------------------------------ |
| 프레임워크          | React Native + Expo SDK 54                             |
| 로컬 저장소         | `@react-native-async-storage/async-storage`            |
| 온라인 DB           | Supabase (`@supabase/supabase-js`)                     |
| 푸시 알림           | `expo-notifications` + Expo Push API                   |
| 배치 실행           | GitHub Actions (3시간 인터벌)                          |
| 제스처              | `react-native-gesture-handler`                         |
| 인스타그램 스크래핑 | [hasdata API](https://hasdata.com)                     |
| 이미지 OCR          | [OCR.space API](https://ocr.space) (Engine 2, 한국어) |

---

## 실행 방법

```bash
cd /Users/choeyunseong/프로젝트/toon-notifier-app
npx expo start
```

### API 키 설정 (`.env.local`)

```
EXPO_PUBLIC_HASDATA_KEY=...
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_OCR_SPACE_KEY=...
```

> `.env.local`은 `.gitignore`에 포함됩니다. 절대 커밋하지 마세요.

### GitHub Actions Secrets 설정

배치 스크립트 실행에 필요한 환경 변수를 GitHub 저장소 Settings → Secrets에 등록:

| Secret 이름            | 내용                        |
| ---------------------- | --------------------------- |
| `SUPABASE_URL`         | Supabase 프로젝트 URL       |
| `SUPABASE_SERVICE_KEY` | Supabase service role key   |
| `HASDATA_KEY`          | hasdata API 키              |
| `OCR_SPACE_KEY`        | OCR.space API 키            |

---

## 파일 구조

```
toon-notifier-app/
├── App.js                        ← 루트: 알림 핸들러 + GestureHandlerRootView + 푸시 토큰 등록
├── app.config.js                 ← Expo 설정 (OTA: ON_LOAD, runtimeVersion: appVersion)
├── eas.json                      ← EAS 빌드 프로필 (production: autoIncrement)
├── config.js                     ← EXPO_PUBLIC_* 환경변수 export (.gitignore 포함)
├── scripts/
│   ├── check-toons.js            ← GitHub Actions 배치: 에피소드 감지 + 푸시 알림 발송
│   └── test-check-toons.js       ← 매칭·필터링 로직 테스트 (filterNewPosts, buildSeriesKeys, captionMatches, ocrMatches — 29개 케이스)
└── src/
    ├── constants/
    │   └── urls.js               ← API Base URL 상수
    ├── screens/
    │   └── HomeScreen.js         ← 메인 화면 (리스트 + 새로고침 + AppState 복귀 처리)
    ├── components/
    │   ├── ToonCard.js           ← 카드 UI (스와이프 삭제, 에피소드 목록 토글)
    │   ├── CardShape.js          ← 카드 좌측 Shape 아이콘 (SVG, ID 기반 결정론적 생성)
    │   ├── AddToonModal.js       ← 툰 추가 바텀시트 (링크 붙여넣기 → 자동 파싱)
    │   └── EmptyState.js         ← 빈 상태 화면
    ├── services/
    │   ├── toon-service.js       ← barrel re-export (toon-store + check-service + notifications)
    │   ├── toon-store.js         ← AsyncStorage CRUD + Supabase 동기화
    │   ├── check-service.js      ← 에피소드 감지 로직 (checkToon, checkAllToons)
    │   ├── notifications.js      ← 로컬 알림 전송 + 권한 요청
    │   ├── instagram-api.js      ← hasdata API 호출 및 응답 파싱
    │   ├── ocr-service.js        ← OCR (ocr.space API, 앱+서버 공통, post.id 캐싱)
    │   └── supabase.js           ← Supabase 클라이언트
    ├── utils/
    │   └── matchingUtils.js      ← 시리즈 키워드 매칭 공통 로직 (앱+서버 공유, CommonJS)
    ├── hooks/
    │   └── useKeywordDetector.js ← matchingUtils re-export (하위 호환)
    ├── context/
    │   └── ThemeContext.js       ← 다크/라이트 테마
    └── theme/
        └── index.js              ← 테마 토큰 (색상, 폰트)
```

---

## 에피소드 감지 흐름

```
인스타그램 게시물 (최신 12개, 최신순으로 처리)
        │
        ▼  ← 각 게시물마다 반복
캡션에 시리즈 키워드 있음? (keyWords, minMatch 기준)
  ├─ YES → 캡션에서 화수 추출
  │         └─ 화수 없음 → OCR 폴백 (캐시 우선 확인)
  └─ NO  → OCR로 이미지에서 키워드 확인 (캐시 우선 확인)
              └─ 키워드 없음 → 건너뜀

화수 추출됨?
  ├─ ep <= readEpisode → 즉시 중단 (이미 읽은 화수 이전은 스킵)
  ├─ ep > readEpisode → collected 배열에 추가, 루프 계속
  └─ ep 없음 → 건너뜀

── 루프 종료 후 ──

collected 비어있음?
  ├─ YES → 변경 없음
  │         └─ 캡션에 시리즈 게시물 전혀 없음? → undetectable 배지 표시
  │         └─ 3주 이상 새 포스트 없음? → 완결 처리
  └─ NO  → episodeHistory + unreadPosts 병합 저장
             알림 전송: "3화, 4화가 추가되었어요" (복수화 합산)
```

### 직접 확인(undetectable) 배지

최신 12개 게시물 캡션 어디에도 시리즈 키워드가 없을 때 표시.
감지 루프가 완료된 뒤에 판단하므로, OCR 기회를 먼저 보장한다.
당겨서 수동 새로고침 시 undetectable 툰도 재시도한다.

### 키워드 매칭 전략 (`matchingUtils.js`)

앱(`check-service.js`)과 서버(`check-toons.js`) 모두 `matchingUtils.js`의 동일한 함수를 사용한다.

| 경로      | 함수            | 기준                                         |
| --------- | --------------- | -------------------------------------------- |
| 캡션 매칭 | `captionMatches` | `keyWords` 중 `minMatch`개 이상 토큰 일치    |
| OCR 매칭  | `ocrMatches`    | `keyWords` 중 `minMatch`개 이상 substring 포함 |

> `keyWords`: 시리즈명에서 3자 이상 단어 우선, 없으면 가장 긴 2개  
> `minMatch`: `min(2, keyWords.length)`  
> 비교 시 대소문자 구분 없음 (`toLowerCase()` 정규화) — 영문/영숫자가 섞인 시리즈명(예: `ReLIFE`, `SSS급`)이 캡션·OCR 텍스트와 대소문자만 다를 때도 매칭됨. 한글은 대소문자 개념이 없어 영향 없음.  
> 캡션 토큰화는 공백이 아니라 문자종류 경계 기준(`match(/[가-힣a-z]+|[0-9]+/g)`) — "시리즈47화"처럼 시리즈명과 화수 마커를 붙여써도 매칭됨.

### 화수 추출 패턴 (`extractEpisodeNumber`)

| 형식            | 예시    |
| --------------- | ------- |
| `n화`           | `47화`  |
| `n편`           | `3편`   |
| `ep.n` / `EP n` | `ep.12` |
| `#n`            | `#47`   |
| 줄 단위 독립 숫자 | `\n47\n` → `47` |

### 화수 추출 패턴 (OCR 추가, `extractEpisodeNumberFromOCR`)

| 형식              | 예시        |
| ----------------- | ----------- |
| 괄호 안 숫자      | `(2,` → `2` |
| 첫 번째 독립 숫자 | `\b47\b`    |

---

## 데이터 모델

### toons — 로컬(AsyncStorage) 필드 전체

```js
{
  id: string,              // UUID
  username: string,        // 인스타 계정명 (@ 제외)
  seriesName: string,      // 시리즈 이름 (키워드 매칭 기준)
  lastEpisode: number,     // 마지막 감지된 화수
  readEpisode: number,     // 사용자가 읽음 처리한 화수
  hasNewEpisode: boolean,  // 새 에피소드 여부
  isComplete: boolean,     // 완결 여부
  pendingComplete: boolean, // 미읽은 화 있는 동안 완결 알림 유예
  undetectable: boolean,   // 최신 12개에 시리즈 게시물 없음 → 직접 확인 필요
  episodeHistory: Array<{ episode: number, url: string }>, // 누적 에피소드 기록 (등록화 포함)
  unreadPosts: Array<{ episode: number, url: string }>,    // 아직 안 읽은 에피소드 목록
  lastPostId: string,      // 마지막 확인한 게시물 ID
  lastPostUrl: string,     // 게시물 링크
  lastThumbnailUrl: string,
  lastEpisodeTitle: string,
  addedAt: string,         // ISO 날짜
  updatedAt: string,
}
```

### toons — 로컬 ↔ Supabase 필드 매핑

Supabase 컬럼은 snake_case라 로컬(camelCase)과 이름이 다르고, **모든 필드가 양방향 동기화되는 건 아니다.**

| 로컬 필드 | Supabase 컬럼 | 동기화 방향 |
| --- | --- | --- |
| `id`, `username`, `seriesName`→`series_name` | 동일 의미 | insert 시 1회 (`addToon`) |
| `lastEpisode` → `last_episode` | 양방향 | 앱 감지·서버 배치 모두 갱신, `syncFromSupabase`로 로컬에 반영 |
| `readEpisode` → `read_episode` | 앱 → Supabase | `advanceEpisode`, `markAsRead`에서 갱신 |
| `hasNewEpisode` → `has_new_episode` | 양방향 | |
| `unreadPosts` → `unread_posts` | 양방향 | |
| `lastPostUrl` → `last_post_url` | 양방향 | |
| `isComplete` → `is_complete` | **서버 → 앱 단방향** | 서버 배치만 씀, 앱은 `syncFromSupabase`로 읽기만 함 |
| `lastPostId` → `last_post_id` | **서버 전용** | 서버 배치만 씀, 앱은 Supabase에 안 씀 |
| `lastThumbnailUrl` → `last_thumbnail_url` | **서버 전용** | |
| `lastEpisodeTitle` → `last_episode_title` | **서버 전용** | |
| `episodeHistory`, `pendingComplete`, `undetectable` | **로컬 전용** | Supabase 컬럼 자체가 없음 |
| (로컬에 없음) | `device_id` | **Supabase 전용** — 등록한 기기 식별용, `getDeviceId()`가 AsyncStorage에 별도 보관하고 쿼리 시에만 사용 |

### push_tokens (Supabase)

```js
{
  token: string,     // Expo push token (ExponentPushToken[...])
  platform: string,  // 'ios' | 'android'
  device_id: string  // 디바이스 식별자
}
```

---

## 에피소드 상태 표시 규칙

| 상태             | 카드 배지                  |
| ---------------- | -------------------------- |
| 새 에피소드 있음 | `새 에피소드` (강조색)     |
| 읽음 처리 후     | `읽음` (회색)              |
| 완결             | `완결` / `완결됨!`         |
| 직접 확인 필요   | `직접 확인` (회색)         |

### 카드 탭 동작

| 동작        | 결과                                                            |
| ----------- | --------------------------------------------------------------- |
| 탭          | 에피소드 목록 아코디언 펼치기 / 닫기 (애니메이션)               |
| 에피소드 탭 | 해당 화 인스타 게시물 열기; 안 읽은 화면 readEpisode 자동 진행  |
| 스와이프    | 툰 삭제                                                         |
| 새로고침 ↺  | 해당 툰 단건 체크 (OCR 포함)                                    |
| IG 아이콘   | 해당 계정 인스타그램 프로필 열기                                |

### 툰 추가 모달

1. 마지막으로 읽은 화의 인스타그램 링크 붙여넣기 (필수)
2. 링크 가져오기 성공 후 계정명 / 시리즈명 / 화수 자동 채움
3. 자동 채운 값 직접 수정 가능 (링크 가져오기 전 필드 잠김)
4. 힌트 텍스트: 자동 인식 결과 수정 안내, 화수 정확히 입력 안내

---

## 기능구현서

### 핵심 기능

| 기능 | 설명 |
| ---- | ---- |
| 툰 등록 | 인스타 게시물 링크 붙여넣기 → 계정명 / 시리즈명 / 화수 자동 파싱 |
| 에피소드 감지 | 캡션 키워드 매칭 + 정규식 화수 추출 (`n화` / `n편` / `ep.n` / `#n`) |
| OCR 폴백 | 캡션에서 화수 추출 실패 시 썸네일 이미지를 ocr.space API로 인식 — 앱·서버 모두 동일 API 사용 |
| OCR 캐싱 | post.id를 키로 AsyncStorage에 결과 저장 → 동일 포스트 반복 API 호출 방지 |
| 최신순 검사 + 조기 중단 | 포스트를 최신순으로 검사하다가 readEpisode 이하 화수 도달 시 즉시 중단 |
| 완결 처리 | `완` / `완결` 패턴 감지 또는 3주 이상 새 포스트 없으면 완결 처리 |
| 푸시 알림 | GitHub Actions 배치(3시간)가 새 화수 감지 시 Expo Push로 기기 알림 전송 |
| 에피소드 목록 | 카드 탭 시 읽은 화 / 안 읽은 화 목록 펼치기, 화수 탭 → 인스타 이동 + 읽음 처리 |
| 스와이프 삭제 | 카드 좌스와이프로 툰 삭제 |
| 다크 모드 | 시스템 기본값 연동, 헤더 버튼으로 수동 전환 |
| 백그라운드 복귀 | AppState 감지 → 포그라운드 복귀 시 목록 자동 갱신 |

### 아키텍처

| 레이어 | 파일 | 역할 |
| ------ | ---- | ---- |
| 공통 로직 | `src/utils/matchingUtils.js` | 앱·서버 공유 매칭 로직 (단일 진실 공급원) |
| 앱 로직 | `src/services/toon-store.js` | AsyncStorage CRUD + Supabase 동기화 |
| 앱 로직 | `src/services/check-service.js` | 에피소드 감지 (`checkToon`, `checkAllToons`) |
| 앱 로직 | `src/services/notifications.js` | 로컬 알림 전송 |
| 서버 배치 | `scripts/check-toons.js` | GitHub Actions: 감지 + 푸시 알림 |
| 데이터 | Supabase | 서버↔앱 상태 동기화, 푸시 토큰 저장 |
| OTA | EAS Update | JS 변경 시 새 빌드 없이 즉시 배포 |

---

## AI 개발 프로세스

이 프로젝트는 Claude Code를 AI 개발 파트너로 활용하며, `AGENTS.md` + `.claude/`에 다음 3가지 장치를 실제로 구현해서 운영합니다.

| 장치 | 내용 |
| ---- | ---- |
| 리스크 기반 승인 게이트 | 작업 범위를 Low / Medium / High로 분류해, 핵심 로직(매칭 로직·DB 스키마·배포 설정) 변경은 반드시 계획 승인 후 구현하고 단순 UI 변경은 바로 진행하도록 절차 강도를 차등 적용 |
| 역할 분리 에이전트 | 탐색 전용 `toon-researcher`(읽기 전용, 기존 로직 중복 확인), 계획 수립(Plan Mode), 배포 전 자가검증 전용 `toon-reviewer`로 구현·검증 과정을 분리 |
| 자동 로그 + 지식 베이스 | 도구 사용 이력은 `.claude/logs/agent-activity.jsonl`에 자동 기록(로컬 전용), 해결한 문제의 원인·해결 방법은 `AGENTS.md`의 트러블슈팅 로그에 사람이 정제해서 기록 — 재연성과 지식 축적을 분리해서 관리 |

자세한 규칙은 `AGENTS.md`를 참고하세요.
