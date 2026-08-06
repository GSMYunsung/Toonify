# 서비스 레이어 아키텍처

---

## 레이어 구조

```
screens/HomeScreen.js
    ↓ import
components/ (ToonCard, AddToonModal, ...)
    ↓ import
services/toon-service.js   ← 외부에서 import하는 단일 barrel 진입점
    ↓ re-exports
    toon-store.js      — AsyncStorage CRUD + Supabase 동기화
    check-service.js   — 에피소드 감지 (앱 내 수동 체크)
    notifications.js   — 로컬 알림 전송

utils/matchingUtils.js     ← 앱(src/) + 서버(scripts/) 공유 (CommonJS)
```

---

## 파일별 단일 책임

| 파일 | 역할 | 하면 안 되는 것 |
|------|------|----------------|
| `toon-store.js` | AsyncStorage 읽기/쓰기, Supabase 동기화 | 에피소드 감지 로직 |
| `check-service.js` | 에피소드 감지, 알림 트리거 | 직접 AsyncStorage 접근 (toon-store 경유해야 함) |
| `instagram-api.js` | hasdata API 호출 + 응답 파싱 | 키워드 매칭 이상의 로직 |
| `ocr-service.js` | ocr.space API 호출 + 캐시 관리 | 키워드 매칭 로직 |
| `matchingUtils.js` | 키워드 매칭, 화수 추출 | I/O, API 호출 일체 |

---

## 앱 vs 서버 역할 비교

| 항목 | 앱 (check-service.js) | 서버 (scripts/check-toons.js) |
|------|----------------------|-------------------------------|
| 트리거 | 수동 새로고침 (pull-to-refresh) | GitHub Actions cron 3시간 |
| 포스트 필터 | 없음 (전체 재확인) | `last_post_id` 기준 신규만 처리 |
| 결과 처리 | AsyncStorage 업데이트 + 로컬 알림 | Supabase 업데이트 + Expo Push 발송 |
| OCR 캐시 | AsyncStorage `ocr_cache_v1` (post.id 키) | 없음 |

---

## 공유 로직 원칙

앱과 서버 양쪽에서 쓰는 함수는 반드시 `src/utils/matchingUtils.js`에 두고:

```js
// 앱 (src/)
import { extractEpisodeNumber, captionMatches } from '../utils/matchingUtils';

// 서버 (scripts/)
const { extractEpisodeNumber, captionMatches } = require('./src/utils/matchingUtils');
```

새 공통 로직이 생기면 즉시 matchingUtils.js로 추출할 것.
