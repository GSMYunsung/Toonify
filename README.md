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
| 새 편을 놓치지 않으려면 직접 계정을 방문해야 함 | GitHub Actions가 1시간마다 자동으로 체크해 알림 전송 |
| 인스타그램 일반 알림에 섞여 툰 업데이트를 구분하기 어려움 | 시리즈 이름 키워드 매칭으로 인스타툰 게시물만 필터링 |
| 화수가 캡션에 없고 이미지에만 적혀있는 경우 감지 불가 | OCR로 이미지에서 화수 직접 인식 |
| 몇 화까지 읽었는지 기억하기 어려움 | 읽음 처리 기능으로 진도 관리 |

---

## 프로젝트 개요

| 항목        | 내용                       |
| ----------- | -------------------------- |
| 플랫폼      | React Native (Expo SDK 54) |
| 지원 기기   | Android (iOS는 EAS 빌드 필요) |
| 테스트 환경 | Expo Go                    |
| 버전        | 1.0.0                      |

---

## 서비스 구조

```
📱 앱 (Expo Go)
  │  앱 실행 시 Expo push token → Supabase 저장
  │  툰 추가/삭제/읽음 처리 → Supabase 동기화
  ▼
🗄️ Supabase (온라인 DB)
  │  toons 테이블: 등록된 툰 목록
  │  push_tokens 테이블: 디바이스 푸시 토큰
  ▼
⚙️ GitHub Actions (1시간마다 자동 실행)
  │  Supabase에서 툰 목록 읽기
  │  인스타 API로 새 편 확인
  │  새 편 발견 시 Expo Push API로 알림 전송
  ▼
📳 폰에 푸시 알림 도착
```

---

## 기능 요약

- 인스타툰 계정 등록 / 수정 / 삭제 (스와이프 삭제, 롱프레스 수정)
- 캡션 키워드 매칭으로 새 에피소드 자동 감지
- 이미지 OCR을 통한 화수 인식 (캡션에 화수가 없을 때)
- GitHub Actions 배치로 1시간마다 자동 체크
- 새 에피소드 발견 시 Expo Push API로 푸시 알림 전송
- NEW 카드 탭 → 안 본 다음 화 링크로 바로 이동 (순서대로 한 화씩)
- 새 에피소드 감지 시 게시물 썸네일을 카드에 표시, 없으면 이모지 배경
- 읽음 처리 / NEW 배지 표시
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

| 항목       | 내용                                                     |
| ---------- | -------------------------------------------------------- |
| 용도       | 캡션에 화수가 없을 때 게시물 이미지에서 텍스트 추출      |
| 엔드포인트 | `GET https://api.ocr.space/parse/imageurl`               |
| 인증       | `apikey` 쿼리 파라미터                                   |
| 설정       | `language=kor`, `OCREngine=2`, `isOverlayRequired=false` |
| 무료 한도  | 25,000회 / 월                                            |
| 사용 파일  | `src/services/ocr-service.js`                            |

> **Engine 2** 선택 이유: 기본 Engine 1보다 스타일 폰트와 이미지 내 숫자 인식률이 높음

---

### 3. Supabase — 온라인 데이터베이스

| 항목      | 내용                                          |
| --------- | --------------------------------------------- |
| 용도      | 툰 목록 및 디바이스 push token 저장           |
| 테이블    | `toons`, `push_tokens`                        |
| 사용 파일 | `src/services/supabase.js`, `scripts/check-toons.js` |

### 4. Expo Push API — 푸시 알림 전송

| 항목      | 내용                                       |
| --------- | ------------------------------------------ |
| 용도      | GitHub Actions에서 디바이스로 알림 전송    |
| 엔드포인트 | `POST https://exp.host/--/api/v2/push/send` |
| 인증      | 불필요 (Expo 토큰 기반)                    |
| 비용      | 무료                                       |

---

## 기술 스택

| 분류                | 라이브러리 / 서비스                                   |
| ------------------- | ----------------------------------------------------- |
| 프레임워크          | React Native + Expo SDK 54                            |
| 로컬 저장소         | `@react-native-async-storage/async-storage`           |
| 온라인 DB           | Supabase (`@supabase/supabase-js`)                    |
| 푸시 알림           | `expo-notifications` + Expo Push API                  |
| 배치 실행           | GitHub Actions (1시간 인터벌)                         |
| 제스처              | `react-native-gesture-handler`                        |
| 인스타그램 스크래핑 | [hasdata API](https://hasdata.com)                    |
| 이미지 OCR          | [OCR.space API](https://ocr.space) (Engine 2, 한국어) |

---

## 실행 방법

```bash
cd /Users/choeyunseong/프로젝트/toon-notifier-app
npx expo start
```

Expo Go 앱으로 QR 코드 스캔 → 즉시 폰에서 실행

### API 키 설정 (`config.js`)

```js
export const HASDATA_KEY = "YOUR_HASDATA_KEY";
export const OCR_SPACE_KEY = "YOUR_OCR_SPACE_KEY";
export const SUPABASE_URL = "YOUR_SUPABASE_URL";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

> `config.js`는 `.gitignore`에 포함되어 있습니다. 절대 커밋하지 마세요.

### GitHub Actions Secrets 설정

배치 스크립트 실행에 필요한 환경 변수를 GitHub 저장소 Settings → Secrets에 등록:

| Secret 이름          | 내용                        |
| -------------------- | --------------------------- |
| `SUPABASE_URL`       | Supabase 프로젝트 URL       |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `HASDATA_KEY`        | hasdata API 키              |
| `OCR_SPACE_KEY`      | OCR.space API 키            |

---

## 파일 구조

```
toon-notifier-app/
├── App.js                        ← 루트: 알림 핸들러 + push token 등록
├── app.json                      ← Expo 앱 설정 (EAS projectId 포함)
├── eas.json                      ← EAS 빌드 설정
├── config.js                     ← API 키 (gitignore)
├── scripts/
│   └── check-toons.js            ← GitHub Actions 배치 스크립트
├── .github/workflows/
│   └── check-toons.yml           ← 1시간마다 배치 실행
└── src/
    ├── screens/
    │   └── HomeScreen.js         ← 메인 화면 (섹션 리스트 + 새로고침)
    ├── components/
    │   ├── ToonCard.js           ← 카드 UI (스와이프 삭제, NEW 배지)
    │   ├── AddToonModal.js       ← 툰 추가 바텀시트 (드래그 투 디스미스)
    │   └── EmptyState.js         ← 빈 상태 화면
    ├── services/
    │   ├── toon-service.js       ← AsyncStorage CRUD + Supabase 동기화
    │   ├── supabase.js           ← Supabase 클라이언트
    │   ├── instagram-api.js      ← hasdata API 호출 및 응답 파싱
    │   └── ocr-service.js        ← OCR.space API (이미지 → 텍스트)
    ├── hooks/
    │   └── useKeywordDetector.js ← 화/편/ep 숫자 추출 정규식
    └── utils/
        └── emoji-icon.js         ← 시리즈 이름 → 이모지 매핑
```

---

## 에피소드 감지 흐름

```
인스타그램 게시물 (최신 3개)
        │
        ▼
캡션에 시리즈 키워드 있음?
  ├─ YES → 캡션에서 화수 추출
  │         └─ 화수 없음 → OCR 폴백
  └─ NO  → OCR로 이미지에서 키워드 확인
              └─ 키워드 없음 → 건너뜀

화수 > lastEpisode?
  ├─ YES (새 에피소드) → Supabase 업데이트 + 푸시 알림 전송
  └─ NO  → 건너뜀
```

### 키워드 매칭 전략

| 경로      | 사용 단어                     | 이유                      |
| --------- | ----------------------------- | ------------------------- |
| 캡션 매칭 | 시리즈명에서 가장 긴 단어 2개 | 흔한 짧은 단어 오탐 방지  |
| OCR 매칭  | 시리즈명 모든 단어(2자 이상)  | OCR 노이즈 허용, 관대하게 |

### 화수 추출 패턴 (캡션)

| 형식            | 예시    |
| --------------- | ------- |
| `n화`           | `47화`  |
| `n편`           | `3편`   |
| `ep.n` / `EP n` | `ep.12` |
| `#n`            | `#47`   |

### 화수 추출 패턴 (OCR 추가)

| 형식              | 예시            |
| ----------------- | --------------- |
| 괄호 안 숫자      | `(2,` → `2`     |
| 줄 단위 독립 숫자 | `\n47\n` → `47` |

---

## 데이터 모델

### toons (Supabase + AsyncStorage)

```js
{
  id: string,              // UUID
  username: string,        // 인스타 계정명 (@ 제외)
  seriesName: string,      // 시리즈 이름 (키워드 매칭 기준)
  lastEpisode: number,     // 마지막 감지된 화수
  readEpisode: number,     // 사용자가 읽음 처리한 화수
  hasNewEpisode: boolean,  // 새 에피소드 여부
  lastPostId: string,      // 마지막 확인한 게시물 ID
  lastPostUrl: string,     // 게시물 링크
  lastThumbnailUrl: string,
  lastEpisodeTitle: string,
  deviceId: string,        // 디바이스 식별자 (push token 매칭용)
  addedAt: string,         // ISO 날짜
  updatedAt: string,
}
```

### push_tokens (Supabase)

```js
{
  token: string,    // Expo push token (ExponentPushToken[...])
  platform: string, // 'ios' | 'android'
  device_id: string // 디바이스 식별자
}
```

---

## 에피소드 상태 표시 규칙

| 상태             | 카드 표시                                          |
| ---------------- | -------------------------------------------------- |
| 새 에피소드 있음 | `47화까지 나옴 · 45화까지 봄` + NEW 배지           |
| 새 에피소드 있음 | 카드 하단에 `2화 보러가기 →` 힌트 표시             |
| 읽음 처리 후     | `47화까지 봄`                                      |
| 등록만 한 경우   | `n화까지 나옴 · 아직 읽은 편 없음`                 |

### 카드 탭 동작

| 상태               | 동작                                                        |
| ------------------ | ----------------------------------------------------------- |
| NEW + unreadPosts  | 가장 낮은 안 본 화 링크 열기 → readEpisode 1 증가           |
| NEW + unreadPosts 소진 | lastPostUrl 열기 → hasNewEpisode: false              |
| NEW 없음           | 탭 무반응                                                   |
| 롱프레스           | 시리즈 이름 / 읽은 화수 수정 모달 열기                      |

---

## 작업 분담 보고서

|     구분      | 항목             | 내용                                                                         |
| :-----------: | ---------------- | ---------------------------------------------------------------------------- |
|   👤 **나**   | 서비스 기획      | 인스타툰 알림 앱 아이디어 및 전체 방향 설정                                  |
|   👤 **나**   | 요구사항 정의    | 기능 목록, 에피소드 감지 방식, UI 흐름 결정                                  |
|   👤 **나**   | API 키 발급      | hasdata, OCR.space, Supabase 계정 생성 및 키 제공                            |
|   👤 **나**   | 기술 결정        | OCR 엔진 선택 (OCR.space Engine 2 지정)                                      |
|   👤 **나**   | QA 테스트        | 실기기(Expo Go)에서 기능 테스트 및 버그 리포트                               |
|   👤 **나**   | 예외 케이스 발굴 | 완결화 표기, 해시태그 형식, 중복 알림, 화수 null 등 발견 및 수정 요청        |
|   👤 **나**   | 키워드 전략 개선 | 긴 시리즈 제목 오탐 가능성 발견 및 개선 방향 제시                            |
|   👤 **나**   | 사용성 개선      | 드래그 투 디스미스, `@` 입력 처리 등 UX 불편 직접 발견                       |
| 🤖 **Claude** | 전체 아키텍처    | 서비스 레이어 분리, AsyncStorage + Supabase 이중 저장 구조 설계              |
| 🤖 **Claude** | 에피소드 감지    | 캡션 키워드 매칭 + `n화` / `n편` / `ep.n` / `#n` 화수 추출 정규식 구현       |
| 🤖 **Claude** | OCR 연동         | OCR.space API 통합 (`ocr-service.js`), 이미지 → 텍스트 변환 흐름 구현        |
| 🤖 **Claude** | 하이브리드 감지  | 캡션 키워드 없음 → OCR / 캡션 화수 없음 → OCR 폴백 2단계 구조 설계           |
| 🤖 **Claude** | OCR 화수 추출    | 괄호 숫자 `(2,`, 줄 단위 독립 숫자 패턴 추가 (`extractEpisodeNumberFromOCR`) |
| 🤖 **Claude** | 완결 처리        | `완`/`완결` 패턴 감지 → 화수 없을 시 `lastEpisode + 1` 가상 화수 부여        |
| 🤖 **Claude** | 키워드 강화      | 긴 제목 오탐 방지 — 가장 긴 단어 2개만 캡션 매칭에 사용                      |
| 🤖 **Claude** | 중복 알림 방지   | `hasNewEpisode`가 이미 `true`이면 알림 재발송 차단                           |
| 🤖 **Claude** | 배치 시스템      | GitHub Actions 1시간 인터벌 배치, Supabase 연동, Expo Push API 알림 전송     |
| 🤖 **Claude** | Supabase 연동    | 툰 추가/삭제/읽음 처리 시 Supabase 동기화, push token 저장 구조 설계         |
| 🤖 **Claude** | UI 구현          | 카드 리스트, NEW/구독중 섹션 분리, NEW 배지, 이모지 아이콘 자동 매핑         |
| 🤖 **Claude** | 바텀시트 모달    | `PanResponder` 드래그 투 디스미스, TextInput 충돌 없이 전체 영역 적용        |
| 🤖 **Claude** | 스와이프 삭제    | `react-native-gesture-handler` Swipeable 좌스와이프 삭제 구현                |
| 🤖 **Claude** | 다음 화 네비게이션 | `unreadPosts` 배열로 안 본 화 순서대로 링크 이동, `advanceEpisode()` 구현  |
| 🤖 **Claude** | 썸네일 표시      | 새 에피소드 감지 시 게시물 이미지 카드에 표시, 이모지 fallback              |
| 🤖 **Claude** | 툰 수정 기능     | 롱프레스 → 수정 모달 (시리즈명 / 읽은 화수), `updateToonInfo()` + Supabase  |
| 🤖 **Claude** | 라이트/다크 모드 | ThemeContext + AsyncStorage 저장, 시스템 기본값 연동                        |
| 🤖 **Claude** | Supabase 동기화  | 포그라운드 복귀 시 배치 업데이트 반영, `fillMissingUnreadPosts()` 구현      |
| 🤖 **Claude** | 버그 수정        | 첫 체크 조기 종료로 새 화수 미감지, stale props, `@` 입력 처리 등           |
