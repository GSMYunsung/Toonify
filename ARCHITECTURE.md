# 프로젝트 구조 설명서

> 대상: 프론트엔드 2년차 주니어 개발자
> 목적: 이 앱이 어떻게 생겼고, 특히 푸시 알림이 어떻게 흘러가는지 이해하기

---

## 한 줄 요약

> 사용자가 인스타툰을 등록하면, GitHub 서버가 1시간마다 새 편을 확인해서 폰으로 알림을 보내준다.

---

## 큰 그림

이 앱은 "폰 앱"과 "서버 스크립트" 두 가지가 같이 돌아간다.

```
┌─────────────────────┐        ┌──────────────────────┐
│   📱 React Native   │◄──────►│   🗄️ Supabase (DB)   │
│       (폰 앱)        │        │  (온라인 데이터베이스)  │
└─────────────────────┘        └──────────┬───────────┘
                                           │
                               ┌──────────▼───────────┐
                               │  ⚙️ GitHub Actions    │
                               │  (1시간마다 자동 실행) │
                               └──────────────────────┘
```

- **폰 앱**: 사용자가 툰을 등록하고, 알림을 받고, 링크를 클릭하는 곳
- **Supabase**: 툰 목록과 폰 주소(push token)를 저장하는 온라인 DB
- **GitHub Actions**: 서버 없이 GitHub에서 1시간마다 자동으로 인스타를 체크하는 스크립트

---

## 파일 구조

```
toon-notifier-app/
│
├── App.js                         ← 앱 진입점. 알림 권한 요청 + push token 등록
├── app.config.js                  ← Expo 설정 (앱 이름, EAS 프로젝트 ID, env var 주입)
├── config.js                      ← API 키 (EXPO_PUBLIC_ 환경변수에서 읽음)
├── google-services.json           ← Firebase FCM 설정 (Android 푸시 알림)
│
├── scripts/
│   └── check-toons.js             ← GitHub Actions에서 실행되는 서버 스크립트
│
├── .github/workflows/
│   └── check-toons.yml            ← "1시간마다 check-toons.js 실행해" 설정 파일
│
└── src/
    ├── context/
    │   └── ThemeContext.js        ← 라이트/다크 모드 상태 관리
    │
    ├── theme/
    │   └── index.js               ← 컬러 토큰 정의 (라이트/다크)
    │
    ├── screens/
    │   └── HomeScreen.js          ← 메인 화면. 툰 리스트 + 상태 관리
    │
    ├── components/
    │   ├── ToonCard.js            ← 툰 하나를 표시하는 카드 컴포넌트
    │   ├── AddToonModal.js        ← 툰 추가하는 바텀시트 모달
    │   └── EmptyState.js          ← 툰이 없을 때 보여주는 빈 화면
    │
    ├── services/
    │   ├── toon-service.js        ← 핵심 로직. 데이터 읽기/쓰기 + 에피소드 감지
    │   ├── supabase.js            ← Supabase 클라이언트 초기화
    │   ├── instagram-api.js       ← hasdata API 호출 (인스타 게시물 가져오기)
    │   └── ocr-service.js         ← OCR.space API (이미지에서 화수 읽기)
    │
    ├── hooks/
    │   └── useKeywordDetector.js  ← 화수 추출 정규식 (n화, n편, ep.n 등)
    │
    └── utils/
        └── emoji-icon.js          ← 시리즈 이름 → 이모지 자동 매핑
```

---

## 데이터 저장소가 두 군데인 이유

| 저장소 | 역할 | 누가 쓰냐 |
|--------|------|-----------|
| AsyncStorage (폰 로컬) | 빠른 UI 렌더링용 | 폰 앱만 |
| Supabase (온라인 DB) | 서버 스크립트와 공유 | 폰 앱 + GitHub Actions |

폰 앱이 툰을 추가/수정하면 **둘 다** 업데이트한다.
GitHub Actions는 Supabase만 읽고 쓴다 (폰 로컬은 접근 불가).

---

## 푸시 알림 전체 흐름

### 1단계 — 앱 최초 실행 시 (App.js)

```
앱 시작
  └─► 알림 권한 요청
  └─► Expo push token 발급
        (ExponentPushToken[xxxxxx] 형태의 "이 폰의 주소")
  └─► Supabase push_tokens 테이블에 저장
        { token, platform: 'android', device_id: '...' }
```

- `App.js`의 `getExpoPushTokenAsync()`가 Expo 서버에서 이 폰 고유의 주소를 받아온다.
- 이 토큰이 있어야 나중에 알림을 보낼 수 있다.

---

### 2단계 — 툰 등록 시 (AddToonModal → toon-service.js)

```
사용자가 툰 추가
  └─► AsyncStorage에 저장 (로컬)
  └─► Supabase toons 테이블에 저장
        { id, username, series_name, last_episode, device_id, ... }
```

- `device_id`가 중요하다. 나중에 "이 툰의 주인에게 알림 보내기" 할 때 사용.

---

### 3단계 — GitHub Actions 배치 (scripts/check-toons.js)

1시간마다 GitHub 서버에서 자동 실행된다.

```
Supabase에서 툰 목록 전체 읽기
  └─► 각 툰에 대해:
        hasNewEpisode가 이미 true면 건너뜀 (HASDATA 절약)
        hasdata API로 인스타 최신 게시물 가져오기
        캡션에서 화수 추출 (n화, n편 등)
        추출한 화수 > 기존 last_episode?
          └─► YES: Supabase toons 업데이트 (has_new_episode: true)
                   Supabase push_tokens에서 device_id로 token 조회
                   Expo Push API로 알림 전송
                   └─► 📳 폰에 알림 도착
          └─► NO: 건너뜀
```

- 이 스크립트는 **폰 앱의 AsyncStorage에는 접근하지 못한다**.
- 그래서 Supabase만 업데이트하고, 폰 앱은 나중에 동기화한다.

---

### 4단계 — 알림 탭 후 앱 진입 (HomeScreen.js)

사용자가 알림을 탭하면 앱이 열린다. 이때:

```
앱 포그라운드 진입 감지 (AppState 'active')
  └─► syncFromSupabase()
        Supabase에서 has_new_episode: true인 툰 확인
        로컬 AsyncStorage에 hasNewEpisode: true 반영
        └─► NEW 배지 표시됨
  └─► fillMissingUnreadPosts()
        unreadPosts가 비어있는 툰에 대해
        hasdata API로 최신 게시물 가져오기
        안 본 화 URL 목록 구성 (readEpisode 기준)
        └─► unreadPosts: [{ episode: 2, url: '...' }, { episode: 3, url: '...' }]
```

---

### 5단계 — 카드 탭 (ToonCard.js)

```
NEW 배지 있는 카드 탭
  └─► unreadPosts[0] 꺼내기 (가장 낮은 안 본 화)
  └─► Linking.openURL(url) → 인스타그램 앱/브라우저 열림
  └─► advanceEpisode() 호출
        readEpisode = 방금 본 화
        unreadPosts에서 앞에서 제거
        unreadPosts가 빈 경우 hasNewEpisode: false
```

---

## 핵심 함수 지도 (toon-service.js)

| 함수 | 하는 일 |
|------|---------|
| `addToon` | 툰 추가 → AsyncStorage + Supabase |
| `deleteToon` | 툰 삭제 → AsyncStorage + Supabase |
| `markAsRead` | 읽음 처리 → AsyncStorage + Supabase |
| `checkToon` | 인스타 API 호출 → 새 편 감지 → unreadPosts 구성 |
| `checkAllToons` | 모든 툰에 checkToon 순차 실행 |
| `syncFromSupabase` | 배치가 업데이트한 내용을 로컬에 반영 |
| `fillMissingUnreadPosts` | 링크 없는 툰만 API 호출해서 링크 채우기 |
| `advanceEpisode` | 화 열람 후 readEpisode 앞으로 이동 |
| `buildUnreadPosts` | 전체 포스트에서 안 본 화 URL 목록 구성 |

---

## 자주 헷갈리는 것들

**Q. 왜 AsyncStorage랑 Supabase 둘 다 써요?**

AsyncStorage는 폰 로컬이라 빠르다. UI는 여기서 읽는다.
Supabase는 GitHub Actions 서버 스크립트가 읽어야 하기 때문에 필요하다.

**Q. hasNewEpisode랑 unreadPosts 차이가 뭔가요?**

- `hasNewEpisode: true` → "NEW 배지 보여줘"
- `unreadPosts` → "카드 탭하면 어떤 링크 열어줘야 해?"

둘 다 있어야 카드를 탭했을 때 올바른 화로 이동한다.

**Q. HASDATA는 언제 호출돼요?**

- 배치 (GitHub Actions): 1시간마다, `hasNewEpisode: false`인 툰만
- 앱 내 수동 새로고침 (당겨서 새로고침): 모든 툰
- 알림 탭 후 포그라운드: `unreadPosts`가 비어있는 툰만
