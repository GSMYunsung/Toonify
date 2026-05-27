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

## #3 — EAS 빌드 시 config.js 파일 없음 오류

**날짜:** 2026-05-27

**에러 메시지:**
```
None of these files exist:
  * config(.android.ts|.native.ts|.ts|.android.js|.native.js|.js)
```

`src/services/supabase.js` 3번 줄: `import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config';`

**원인:**

`config.js`가 `.gitignore`에 포함되어 있었음. 로컬에선 파일이 존재하지만 EAS 빌드 서버는 git clone으로 코드를 가져오기 때문에 gitignore된 파일은 서버에 존재하지 않음. Metro 번들러가 `config.js`를 찾지 못해 빌드 실패.

**해결 방법:**

API 키를 EAS Secrets에 등록하고, `app.config.js`를 통해 앱 번들에 주입하는 방식으로 전환.

**1. EAS Secrets 등록** (preview + production 환경 각각)
```bash
npx eas env:create --environment preview --name HASDATA_KEY --value "..." --visibility secret
npx eas env:create --environment preview --name OCR_SPACE_KEY --value "..." --visibility secret
npx eas env:create --environment preview --name SUPABASE_URL --value "..." --visibility secret
npx eas env:create --environment preview --name SUPABASE_ANON_KEY --value "..." --visibility secret
# production도 동일하게
```

**2. `app.json` → `app.config.js` 전환**

`app.config.js`는 Node.js 환경에서 실행되므로 `process.env`로 EAS Secrets를 읽을 수 있음.
읽은 값을 `extra`에 담아 앱 번들에 포함시킴.

```js
// app.config.js
module.exports = {
  expo: {
    // ...기존 설정 동일...
    extra: {
      HASDATA_KEY: process.env.HASDATA_KEY,
      OCR_SPACE_KEY: process.env.OCR_SPACE_KEY,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      eas: { projectId: "..." },
    },
  },
};
```

**3. `config.js` 수정 — 실제 키 제거, Constants에서 읽기**

```js
// config.js (이제 git에 커밋 가능, 실제 키 없음)
import Constants from 'expo-constants';
const extra = Constants.expoConfig?.extra ?? {};

export const HASDATA_KEY = extra.HASDATA_KEY;
export const OCR_SPACE_KEY = extra.OCR_SPACE_KEY;
export const SUPABASE_URL = extra.SUPABASE_URL;
export const SUPABASE_ANON_KEY = extra.SUPABASE_ANON_KEY;
```

**4. `.env.local` 생성 — 로컬 개발용 실제 키 (gitignored)**

Expo SDK 49+는 `.env.local`을 자동으로 로드함. `app.config.js`가 이 값을 `process.env`로 읽어 `extra`에 전달.

```
# .env.local (gitignored — .env*.local 패턴으로 제외됨)
HASDATA_KEY=...
OCR_SPACE_KEY=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

**5. `.gitignore`에서 `config.js` 제외 항목 삭제**

이제 `config.js`는 실제 키가 없으므로 안전하게 git에 포함.

**키 흐름 요약:**
- 로컬 개발: `.env.local` → `app.config.js process.env` → `extra` → `Constants.expoConfig.extra`
- EAS 빌드: EAS Secrets → 빌드 서버 `process.env` → `app.config.js extra` → 앱 번들

---
