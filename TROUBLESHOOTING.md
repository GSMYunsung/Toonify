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
