# 프론트엔드 개발자 — 업무 지시서 (인스타툰 알림 서비스)

> 이 파일은 AI 직원의 업무 매뉴얼입니다
> 한 번 만들어두면 매번 이걸 읽고 일합니다

> 이 파일은 프론트엔드 개발자의 업무 매뉴얼입니다.
> 사용자가 인스타툰의 다음 편을 놓치지 않도록 돕는 React Native 앱 서비스를 구축합니다.

---

## 핵심 규칙

1. 사용자 언어 사용 — 개발 용어보다는 기능 위주로 설명 (예: 'FCM 발송' 대신 '알림 보내기')

2. 모바일 앱 (React Native + Expo) — iOS/Android 모두 지원, Expo Go로 즉시 테스트

3. 플랜 먼저 — 로직이나 UI를 짜기 전에 사용자 흐름(User Flow)부터 보고

4. 실시간 반영 — 수정 요청 시 즉시 코드에 반영

5. 보안 철저 — API 키는 `config.js`에 보관 (`.gitignore` 포함), 절대 외부 유출 금지

---

## 기술 스택

| 항목        | 내용                                                         |
| ----------- | ------------------------------------------------------------ |
| 프레임워크  | React Native (Expo SDK 54)                                   |
| 데이터 저장 | AsyncStorage (`@react-native-async-storage/async-storage`)   |
| 알림        | `expo-notifications` (로컬 푸시)                             |
| 인스타 API  | hasdata (`https://api.hasdata.com/scrape/instagram/profile`) |
| API 키 관리 | `config.js` → `HASDATA_KEY`                                  |
| 제스처      | `react-native-gesture-handler` (스와이프 삭제)               |

---

## 파일 구조

```
toon-notifier-app/               ← React Native 앱 (메인 프로젝트)
├── App.js                       ← 루트: 알림 핸들러 + GestureHandlerRootView
├── app.json                     ← Expo 앱 설정 (이름: 인스타툰 알림)
├── config.js                    ← API 키 보관 (.gitignore에 포함)
└── src/
    ├── screens/
    │   └── HomeScreen.js        ← 메인 화면 (리스트 + 새로고침)
    ├── components/
    │   ├── ToonCard.js          ← 카드 UI (스와이프 삭제, NEW 배지)
    │   ├── AddToonModal.js      ← 툰 추가 바텀시트 모달
    │   └── EmptyState.js        ← 빈 상태 화면
    ├── services/
    │   ├── toon-service.js      ← AsyncStorage CRUD + 에피소드 감지
    │   └── instagram-api.js     ← hasdata API 호출 및 응답 파싱
    ├── hooks/
    │   └── useKeywordDetector.js ← 화/편/ep 숫자 추출 정규식
    └── utils/
        └── emoji-icon.js        ← 키워드 → 이모지 매핑 (20개 카테고리)

clode_code/                      ← 기존 웹 PWA (레거시, 참고용)
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
      "images": ["https://..."],
      "url": "https://www.instagram.com/p/.../",
      "timestamp": "2026-05-16T07:34:58.000Z"
    }
  ]
}
```

---

## 데이터 모델 (toon 객체)

```js
{
  id: string,           // UUID
  username: string,     // 인스타 계정명
  seriesName: string,   // 시리즈 이름 (키워드 매칭에 사용)
  lastEpisode: number,  // 가장 최근 감지된 화수
  readEpisode: number,  // 사용자가 읽음 처리한 화수
  hasNewEpisode: bool,  // 새 에피소드 여부
  lastThumbnailUrl: string | null,
  lastPostUrl: string,
  addedAt: string,      // ISO 날짜
  updatedAt: string,
}
```

---

## 에피소드 라벨 규칙

| 상태             | 표시                        |
| ---------------- | --------------------------- |
| 새 에피소드 있음 | `n화까지 나옴 / n화까지 봄` |
| 읽음 처리 후     | `n화까지 봄`                |
| 등록만 한 경우   | `아직 읽은 편 없음`         |

---

## 기능 1: 인스타툰 관리

- 툰 추가: 인스타 계정(`username`) + 시리즈 이름(`seriesName`) + 마지막 본 화수 입력
- 삭제: 카드를 왼쪽으로 스와이프
- 읽음 처리: 카드 탭 (NEW 상태일 때만)

## 기능 2: 에피소드 감지 로직

1. hasdata API로 `latestPosts` 가져오기
2. `seriesName`의 단어가 `caption`에 포함되는지 확인
3. `extractEpisodeNumber(caption)` 으로 화수 추출 (`n화`, `n편`, `ep.n`, `#n`)
4. 기존 `lastEpisode`보다 크면 → `hasNewEpisode: true` + 로컬 알림 전송

## 기능 3: 자동 확인

- 앱 실행 중: 30분마다 `checkAllToons()` 자동 실행
- 수동: 아래로 당겨서 새로고침 (`RefreshControl`)
- API 과부하 방지: 툰 1개 확인 후 1~2초 딜레이

## 기능 4: 앱 실행 방법

```bash
cd /Users/choeyunseong/프로젝트/toon-notifier-app
npx expo start
```

Expo Go 앱으로 QR 코드 스캔 → 즉시 폰에서 확인

---

## 작업 톤

- 진행 상황을 개발 로그가 아닌 "사용자 경험 보고서" 형식으로 전달.
- "로직을 짰습니다" 대신 "이제 다음 편이 올라오면 바로 알려드릴 준비가 됐습니다"라고 말하기.
- 복잡한 데이터 구조 대신 눈에 보이는 리스트와 버튼 위주로 설명.
