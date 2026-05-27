# 트러블슈팅 로그

> 발생한 문제와 해결 방법을 기록합니다.
> 새 문제가 해결될 때마다 여기에 추가합니다.

---

## #1 — GitHub Actions에서 Supabase WebSocket 오류

**날짜:** 2026-05-27

**에러 메시지:**
```
Error: Node.js 20 detected without native WebSocket support.
Suggested solution: For Node.js < 22, install "ws" package and provide it via the transport option
Node.js v20.20.2
```

**원인:**

Supabase 클라이언트 초기화 시 `getWebSocketConstructor()`가 `globalThis.WebSocket`을 확인하는데,
Node.js 20에는 네이티브 WebSocket이 없어서 초기화 단계에서 바로 에러를 던짐.

처음에 시도한 `realtime: { transport: ws }` 옵션은 실제 연결 단계에서 쓰이는 옵션이라,
초기화 단계에서 터지는 이 에러를 막지 못함.

**해결 방법:**

`createClient()` 호출 전에 `globalThis.WebSocket`을 직접 주입.

```js
// scripts/check-toons.js
if (!globalThis.WebSocket) globalThis.WebSocket = require('ws');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
```

워크플로우에서 `ws` 패키지 설치도 필요:
```yaml
run: npm install --no-save @supabase/supabase-js ws node-fetch
```

---

## #2 — 툰 등록 직후 새로고침 시 새 에피소드 미감지

**날짜:** 2026-05-27

**증상:**

툰을 등록하고 바로 당겨서 새로고침하면, 실제로 `lastEpisode`보다 높은 화수가 올라와 있어도 "새 에피소드 없음"으로 표시됨.

**원인:**

`checkToon()`에 첫 체크 조기 종료 블록이 있었음.

```js
// 문제 코드
if (!toon.lastPostId && posts.length > 0) {
  await updateToon(toon.id, { lastPostId: posts[0].id });
  return { found: false };  // 화수 비교도 안 하고 바로 종료
}
```

툰 등록 직후엔 `lastPostId`가 `null`이므로 이 블록이 실행되어 화수 비교 로직 전체를 건너뜀.
원래 의도는 "첫 체크에서 알림을 보내지 않기"였으나, 결과적으로 이미 나와 있는 새 화수도 감지 못하는 문제가 생김.

**해결 방법:**

1. 첫 체크 조기 종료 블록 제거 → 화수 비교 로직 항상 실행
2. `isNewPost`(포스트 ID 비교) 조건에 `toon.lastPostId &&` 추가 → 첫 체크에서 화수 없는 포스트 오탐 방지
3. 루프 종료 후 새 화수가 없을 때만 `lastPostId` 기준점 저장

```js
// toon-service.js — isNewPost 조건
const isNewPost = ep === null && post.id && toon.lastPostId && post.id !== toon.lastPostId;

// 루프 종료 후
if (posts.length > 0 && !toon.lastPostId) {
  await updateToon(toon.id, { lastPostId: posts[0].id });
}
return { found: false };
```

---

## #3 — EAS 빌드 시 config.js 파일 없음 + Supabase 미연결 오류

**날짜:** 2026-05-27

**에러 메시지 (1단계):**
```
None of these files exist:
  * config(.android.ts|.native.ts|.ts|.android.js|.native.js|.js)
```

`src/services/supabase.js` 3번 줄: `import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config';`

**원인:**

`config.js`가 `.gitignore`에 포함되어 있었음. EAS 빌드 서버는 로컬 파일시스템을 아카이브해서 올리지만, gitignore된 파일은 Metro가 찾지 못해 빌드 실패.

---

**에러 메시지 (2단계) — 빌드는 되는데 Supabase에 데이터가 안 들어감**

빌드 성공 후 앱 실행 시 Supabase에 아무 데이터도 저장되지 않음. 로컬(`npx expo start`)에서는 정상 동작.

**원인:**

`app.json`과 `app.config.js`가 동시에 존재할 때 EAS가 `app.json`을 우선 읽는 경우가 있음.
`app.json`에는 env var 주입 로직이 없어서 `extra`의 API 키가 `undefined`로 빌드됨.

또한 `app.config.js → extra → Constants.expoConfig.extra` 체인 자체가 EAS 빌드 환경에서 불안정함.

---

**최종 해결 방법:**

`EXPO_PUBLIC_` 접두사 변수를 사용. Metro가 빌드 시 해당 변수를 번들에 직접 인라인 치환하므로 중간 체인 없이 확실하게 동작함.

**1. `app.json` 삭제 — `app.config.js`로 단일화**

두 파일 공존 시 충돌 방지.

**2. EAS env vars 등록** (`EXPO_PUBLIC_` 접두사, `sensitive` visibility)
```bash
npx eas env:create --environment preview --name EXPO_PUBLIC_HASDATA_KEY --value "..." --visibility sensitive
npx eas env:create --environment preview --name EXPO_PUBLIC_OCR_SPACE_KEY --value "..." --visibility sensitive
npx eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value "..." --visibility sensitive
npx eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "..." --visibility sensitive
```

**3. `config.js` 수정 — `process.env.EXPO_PUBLIC_*`로 직접 읽기**

```js
// config.js (git에 커밋 가능, 실제 키 없음)
export const HASDATA_KEY = process.env.EXPO_PUBLIC_HASDATA_KEY;
export const OCR_SPACE_KEY = process.env.EXPO_PUBLIC_OCR_SPACE_KEY;
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
```

**4. `.env.local` 생성 — 로컬 개발용 실제 키 (gitignored)**

```
# .env.local (.env*.local 패턴으로 gitignore됨)
EXPO_PUBLIC_HASDATA_KEY=...
EXPO_PUBLIC_OCR_SPACE_KEY=...
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

**키 흐름 요약:**
- 로컬 개발: `.env.local` → Metro 인라인 치환 → `process.env.EXPO_PUBLIC_*`
- EAS 빌드: EAS Secrets → Metro 인라인 치환 → `process.env.EXPO_PUBLIC_*`

---
