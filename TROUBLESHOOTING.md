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

**에러 메시지 (3단계) — push_tokens에 데이터가 안 들어감**

`toons` 테이블에는 데이터가 들어가지만 `push_tokens`에는 아무것도 저장되지 않음.

**원인:**

Android 릴리즈 APK(Hermes 엔진)에서 `getExpoPushTokenAsync()`가 실패함.
Expo 푸시 토큰 발급 과정에서 기기가 먼저 FCM(Firebase Cloud Messaging)에 등록되어야 하는데,
`google-services.json` 없이 빌드된 APK는 FCM 등록을 못 함.

Expo Go에서 동작하는 이유: Expo Go 앱 자체에 Firebase 설정이 내장되어 있어서 공유 사용.

```
Expo 푸시 토큰 발급 흐름:
기기 → FCM 등록 (google-services.json 필요) → Expo 서버 → ExponentPushToken[...]
```

**해결 방법:**

1. Firebase 콘솔에서 프로젝트 생성 → Android 앱 추가 (패키지명: `com.anonymous.toonnotifierapp`)
2. `google-services.json` 다운로드 → 프로젝트 루트에 배치
3. `app.config.js`에 경로 등록:

```js
android: {
  // ...
  googleServicesFile: "./google-services.json",
},
```

4. `google-services.json`은 앱 식별자만 포함하므로 git 커밋 가능 (보안은 Firebase Security Rules 담당)

---

## #4 — 알림 탭 후 앱 진입 시 툰 체크가 다시 돌아가는 문제

**날짜:** 2026-07-08

**증상:**

푸시 알림을 탭해서 앱에 들어오면, 방금 GitHub Actions가 체크를 돌린 직후인데도 앱이 또 다시 Instagram API를 호출함. 서버 부하 + 데이터 충돌 우려.

**원인 추적 과정 (3단계):**

처음엔 `AppState` 리스너가 포그라운드 복귀 시 `syncAndFill()`을 호출해서라고 생각했음. 제거했지만 여전히 발생.

그 다음엔 `init()` 자체에서 `syncFromSupabase()` → `fillMissingUnreadPosts()` → Instagram API 호출 체인이 있었음. `init()`에서 네트워크 호출 전부 제거.

그래도 계속 발생. `checkToon`에 `console.trace()`를 심어서 콜 스택을 직접 출력함:

```
[checkToon] 호출 스택
  at checkToon (toon-service.js)
  at AddToonModal.handleSave (AddToonModal.js)   ← 범인
```

**실제 원인:**

`AddToonModal.handleSave`에서 툰 저장 후 백그라운드로 `checkToon`을 실행하는 코드가 있었음.

```js
// 문제 코드 (AddToonModal.js)
const newToon = await addToon({ ... });
checkToon(newToon).then(() => onUpdate?.()).catch(() => {});  // ← 이게 범인
onAdded();
```

알림을 탭해서 앱에 들어왔을 때 마지막으로 등록된 툰의 `checkToon`이 타이밍상 겹쳐서 실행되던 것.

**해결 방법:**

`AddToonModal.handleSave`에서 `checkToon` 호출 제거. 툰 추가 직후 자동 체크 없앰. 체크는 수동 새로고침(당겨서 갱신)에서만.

```js
// 수정 후
await addToon({ ... });
onAdded();
```

**교훈:**

"어디서 호출하는지 모르겠다" 싶으면 `console.trace()` 먼저. 추측보다 스택 트레이스가 빠름.

---

## #5 — 카드 탭 시 카드가 사라지는 버그 (Swipeable + 중첩 TouchableOpacity 충돌)

**날짜:** 2026-07-08

**증상:**

리스트에서 툰 카드를 탭하면 카드가 사라짐. 특히 에피소드 행을 탭했을 때 카드 자체가 접히면서 섹션까지 이동해버려 "삭제된 것처럼" 보임.

**원인:**

카드 전체가 `TouchableOpacity` (onPress = toggleExpand) 안에 있었고, 에피소드 행도 `TouchableOpacity` (onPress = handleEpisodeTap)로 그 안에 중첩되어 있었음.

```jsx
// 문제 구조
<TouchableOpacity onPress={toggleExpand}>        {/* 카드 전체 */}
  <View style={st.header}> ... </View>
  {expanded && (
    <View>
      <TouchableOpacity onPress={handleEpisodeTap}>  {/* 에피소드 행 */}
      ...
    </View>
  )}
</TouchableOpacity>
```

React Native에서 일반적으로는 내부 TouchableOpacity가 이벤트를 흡수해야 하지만, `react-native-gesture-handler`의 `Swipeable` 안에서는 제스처 시스템이 달라서 두 핸들러가 모두 발동됨.

결과: 에피소드 탭 → `handleEpisodeTap` (에피소드 열기 + 읽음 처리) + `toggleExpand` (카드 접힘) 동시 발동 → 카드가 접히고 + 섹션 이동 → 사라진 것처럼 보임.

**해결 방법:**

카드 전체를 감싸는 `TouchableOpacity`를 `View`로 교체하고, `TouchableOpacity`는 헤더 행에만 적용.

```jsx
// 수정 후
<View style={st.cardContainer}>                  {/* 카드 전체는 View */}
  <TouchableOpacity onPress={toggleExpand}>      {/* 헤더만 TouchableOpacity */}
    <View style={st.header}> ... </View>
  </TouchableOpacity>
  {expanded && (
    <View>
      <TouchableOpacity onPress={handleEpisodeTap}>  {/* 에피소드 행 — 이제 충돌 없음 */}
      ...
    </View>
  )}
</View>
```

에피소드 목록이 toggleExpand의 터치 영역 바깥에 있으므로 두 핸들러가 동시에 발동할 일이 없음.

---

## #6 — 에피소드 탭 시 해당 화수가 목록에서 사라지는 버그

**날짜:** 2026-07-08

**증상:**

에피소드 목록에서 3화를 탭하면 3화가 사라짐. 4화를 탭하면 4화도 사라짐. 단, 툰 등록 시 입력한 기준 화수는 사라지지 않음.

**원인:**

`allEpisodes()`는 `episodeHistory`와 `unreadPosts`를 합산해서 보여줌.

```
episodeHistory: [5화]          ← 등록 시 입력한 기준 화수
unreadPosts:    [6화, 7화, 8화] ← 서버가 감지한 새 에피소드
```

에피소드를 탭하면 `handleEpisodeTap` → `advanceEpisode`가 호출됨.

```js
// advanceEpisode 내부 (수정 전)
t.readEpisode = episode;
t.unreadPosts = remainingPosts;  // 탭한 화수보다 큰 것만 남김 → 탭한 화수는 삭제
```

7화를 탭하면:
- `remainingPosts = unreadPosts.filter(p => p.episode > 7)` = [8화]
- `unreadPosts`가 [8화]로 교체됨 → 6화·7화 소멸
- `episodeHistory`는 여전히 [5화]만
- `allEpisodes()` 결과: [5화, 8화] → **6화·7화가 증발**

기준 화수(5화)만 안 사라지는 이유: `episodeHistory`에 저장되어 있어서.

**해결 방법:**

`advanceEpisode`에서 읽은 화수들을 `unreadPosts`에서 제거하는 게 아니라 `episodeHistory`로 이동.

```js
// 수정 후
const nowRead = (t.unreadPosts || []).filter((p) => p.episode !== null && p.episode <= episode);
const historyMap = {};
for (const h of (t.episodeHistory || [])) historyMap[h.episode] = h;
for (const ep of nowRead) {
  if (!(ep.episode in historyMap)) historyMap[ep.episode] = { episode: ep.episode, url: ep.url };
}
t.episodeHistory = Object.values(historyMap).sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));

t.readEpisode = episode;
t.unreadPosts = remainingPosts;
```

이제 7화를 탭하면:
- 6화·7화 → `episodeHistory`로 이동 (회색 "읽음" 표시)
- 8화 → `unreadPosts`에 남음 (오렌지 "안읽음" 표시)
- `allEpisodes()` 결과: [5화, 6화, 7화, 8화] 전부 표시됨

---

## #7 — 완결 알림은 오는데 카드에는 완결 배지가 안 뜨는 문제

**날짜:** 2026-07-08

**증상:**

GitHub Actions가 완결 화수를 감지해서 "OO이 완결됐어요!" 알림은 정상 수신. 그런데 앱 카드에는 "완결" 배지가 뜨지 않고 "새 에피소드"로만 표시됨.

**원인:**

서버(`check-toons.js`)가 푸시 알림 payload를 만들 때 `isComplete`를 포함하지 않았음.

```js
// 문제 코드 (check-toons.js)
const updates = results.map((r) => ({
  toonId: r.toonId,
  unreadPosts: r.unreadPosts,
  // isComplete 없음!
}));
```

그리고 클라이언트(`applyNotificationUpdates`)도 `isComplete`를 읽지 않았음.

```js
// 문제 코드 (toon-service.js)
for (const { toonId, unreadPosts } of updates) {  // isComplete 구조분해 없음
  t.hasNewEpisode = true;
  t.unreadPosts = unreadPosts;
  // isComplete 반영 안 됨
}
```

추가로 `syncFromSupabase`도 `is_complete` 컬럼을 SELECT하지 않아서 수동 새로고침해도 반영 안 됨.

**해결 방법:**

세 곳 수정:

```js
// 1. check-toons.js — payload에 isComplete 추가
const updates = results.map((r) => ({
  toonId: r.toonId,
  unreadPosts: r.unreadPosts,
  isComplete: r.isComplete ?? false,  // ← 추가
}));

// 2. toon-service.js applyNotificationUpdates — isComplete 반영
for (const { toonId, unreadPosts, isComplete } of updates) {
  t.hasNewEpisode = true;
  t.unreadPosts = unreadPosts;
  if (isComplete) t.isComplete = true;  // ← 추가
}

// 3. toon-service.js syncFromSupabase — is_complete 컬럼 SELECT 추가
.select('id, has_new_episode, last_episode, last_post_url, unread_posts, is_complete, updated_at')
// + 루프 내에서 적용
if (remote.is_complete && !local.isComplete) {
  local.isComplete = true;
  changed = true;
}
```

---

## #8 — captionIsComplete 오탐: 다른 시리즈 완결 포스트 감지

**날짜:** 2026-07-21

**증상:**

전혀 다른 시리즈의 완결 포스트가 현재 시리즈의 새 에피소드로 감지됨. 관계없는 툰에 새 화수 알림이 오는 오탐.

**원인:**

`captionMatched` 조건에서 `captionIsComplete`가 시리즈 키워드 확인을 완전히 우회했음.

```js
// 문제 코드
const captionMatched = captionIsComplete || keyWords.some((w) => caption.includes(w));
// captionIsComplete=true이면 시리즈명 확인 없이 바로 통과
```

**해결 방법:**

`captionIsComplete`도 반드시 시리즈 키워드(`hasAnySeriesWord`)가 함께 있어야 통과하도록 수정.

```js
const hasAnySeriesWord = allWords.some((w) => caption.includes(w));
const captionMatched =
  (captionIsComplete && hasAnySeriesWord) || matchCount >= minMatch;
```

---

## #9 — ATS 오류: 온디바이스 OCR 이미지 다운로드 실패

**날짜:** 2026-07-21

**에러 메시지:**
```
URLSessionTask failed with error: The resource could not be loaded because 
the App Transport Security policy requires the use of a secure connection.
```

**원인:**

`NSAllowsArbitraryLoads`가 `false`로 설정되어 있어 Instagram CDN 이미지 URL에서 HTTP 요청이 차단됨. ML Kit 온디바이스 OCR은 이미지를 로컬에 다운로드한 후 처리하는데, 이 다운로드 단계에서 ATS 정책에 걸림.

**해결 방법:**

`ios/Toonify/Info.plist`에서 `NSAllowsArbitraryLoads`를 `true`로 변경.

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <true/>
  <key>NSAllowsLocalNetworking</key>
  <true/>
</dict>
```

네이티브 파일 변경이므로 새 빌드 필요.

---

## #10 — 앱 OCR 엔진 교체: ML Kit 온디바이스 → ocr.space API

**날짜:** 2026-08-03

**배경:**

ML Kit 온디바이스 OCR을 도입했으나 인스타툰 썸네일의 아트체/손글씨 폰트에서 인식률이 낮아 실용성 부족. 이미지 전처리(1080px 리사이즈), 신뢰도 필터링 등 개선을 시도했으나 근본적 한계 확인.

**해결 방법:**

서버(GitHub Actions)에서 이미 사용 중인 ocr.space API를 앱에도 적용.

- 무료 티어: 월 25,000회 (등록 후)
- OTA 배포 가능 (네이티브 모듈 불필요)
- 기존 ML Kit 패키지는 바이너리에 잔류 → 다음 빌드 시 `npm uninstall` 후 제거 예정

```js
// src/services/ocr-service.js
const params = new URLSearchParams({
  url: imageUrl,
  language: 'kor',
  isOverlayRequired: 'false',
  detectOrientation: 'true',
  scale: 'true',
  OCREngine: '2',
});
const res = await fetch(`https://api.ocr.space/parse/imageurl?${params}`, {
  headers: { apikey: OCR_SPACE_KEY },
});
```

---

## #11 — ocrMatched 완결 단독 통과 오탐

**날짜:** 2026-08-03

**증상:**

`[checkToon] ep=6 isComplete=true isNewEpisode=true` — 새 화가 아닌데 새로운 화로 인식됨.

**원인:**

`ocrMatched` 조건에서 `isCompleteEpisode(ocrText)` 단독으로 통과 가능했음. 이미지 어딘가에 "완결" 글자만 있어도 OCR 매칭을 통과하고, `ep=null`이면 `runningMaxEp+1`로 가상 화수가 배정됨.

```js
// 문제 코드
const ocrMatched =
  allWords.some((w) => ocrText.includes(w)) || isCompleteEpisode(ocrText);
//                                           ↑ 시리즈 키워드 없어도 통과
```

**해결 방법:**

`isCompleteEpisode` 단독 조건 제거. 시리즈 키워드 매칭만으로 판단.

```js
const ocrMatched = allWords.some((w) => ocrText.includes(w));
```

---

## #12 — minMatch=0 오탐: keyWords 비어있을 때 모든 캡션 매칭

**날짜:** 2026-08-03

**증상:**

`⚠️ minMatch=0 오탐가능(keyWords 비었음)` 로그 출력 후 captionMatched=true. 관계없는 포스트가 시리즈 포스트로 인식됨.

**원인:**

`seriesName`의 모든 단어가 2글자 미만이면 `keyWords=[]`, `minMatch=Math.min(2,0)=0`. 결과적으로 `matchCount(0) >= minMatch(0)` → 모든 캡션이 매칭됨.

```js
// 문제 코드
const captionMatched =
  (captionIsComplete && hasAnySeriesWord) || matchCount >= minMatch;
// keyWords=[], minMatch=0 → 0 >= 0 → 항상 true
```

**해결 방법:**

`keyWords.length > 0` 가드 추가.

```js
const captionMatched =
  keyWords.length > 0 && matchCount >= minMatch;
```

---

## #13 — 완결+시리즈단어 1개 오탐

**날짜:** 2026-08-03

**증상:**

시리즈명에 "완"이 포함된 경우, 다른 시리즈 완결 포스트가 `완결+시리즈단어` 조건으로 통과됨.

**원인:**

완결 감지 시 `hasAnySeriesWord`(1개)만 있으면 `captionMatched=true`가 되어 일반 키워드 매칭보다 훨씬 느슨하게 동작.

```js
// 문제 코드
const captionMatched =
  keyWords.length > 0 &&
  ((captionIsComplete && hasAnySeriesWord) || matchCount >= minMatch);
// 완결이면 1개만 매칭돼도 통과
```

**해결 방법:**

완결이든 아니든 `minMatch` 기준 동일 적용. `hasAnySeriesWord` 분기 제거.

```js
const captionMatched = keyWords.length > 0 && matchCount >= minMatch;
// isCompleteEpisode는 캡션 매칭과 별개로 완결 여부 판단에만 활용
```

---

## #14 — OCR/캡션 매칭 기준 불균형으로 OCR이 우회 경로가 되는 문제

**날짜:** 2026-08-03

**증상:**

캡션에서 키워드 2개 필요로 막힌 포스트가 OCR에서는 1개만 있어도 통과됨. 같은 화로 반복 인식되는 오탐 발생.

**원인:**

캡션과 OCR의 매칭 기준이 달랐음.
- 캡션: `keyWords` 중 `minMatch`(2)개 필요
- OCR: `allWords` 중 1개만 있으면 통과 — 더 넓은 단어 목록 + 더 낮은 임계값

```js
// 문제 코드 — OCR이 더 느슨
const ocrMatched = allWords.some((w) => ocrText.includes(w));
```

**해결 방법:**

OCR도 캡션과 동일한 `keyWords` + `minMatch` 기준 적용. 단, OCR 결과는 토큰 분리 없이 `includes`로 검사 (조사 붙은 한국어 대응).

```js
const ocrMatchedWords = keyWords.filter((w) => ocrText.includes(w));
const ocrMatched = ocrMatchedWords.length >= minMatch;
```

---

## #15 — buildUnreadPosts가 checkToon보다 느슨한 기준으로 에피소드 추가

**날짜:** 2026-08-03

**증상:**

"3편까지 나옴" 알림이 왔는데 앱 에피소드 목록에는 5편까지 추가되어 있음. 감지된 화수와 목록에 표시되는 화수가 불일치.

**원인:**

`checkToon`은 엄격한 `keyWords + minMatch` 기준으로 3편만 감지했지만, 에피소드 목록을 만드는 `buildUnreadPosts`는 수정되지 않은 느슨한 조건(`captionIsComplete || allWords.some(...)`)을 그대로 사용해서 더 많은 포스트를 매칭함.

```js
// buildUnreadPosts 문제 코드
const matched = captionIsComplete || allWords.some((w) => cap.includes(w));
// 완결 단독 통과 + 1개 단어 substring 매칭
```

**해결 방법:**

`buildUnreadPosts`도 `checkToon`과 동일한 `keyWords + minMatch` 토큰 매칭 기준 적용.

---

## #17 — ToonCard 불필요한 리렌더링

**날짜:** 2026-07-30

**증상:**

툰 목록을 당겨서 새로고침하면, 데이터가 바뀌지 않은 카드도 전부 리렌더링됨. 툰이 많아질수록 새로고침이 느려질 수 있음.

**원인:**

`HomeScreen`이 새로고침 완료 후 `setToons(sorted)`로 상태를 갱신하면 React는 자식 컴포넌트를 전부 재렌더링함. `ToonCard`는 메모이제이션 없이 `export default function`으로 선언되어 있어, props로 받은 `toon` 객체 참조가 바뀌면 항상 리렌더됨.

또한 `ToonCard` 내부의 `allEpisodes()` 함수가 매 렌더마다 `episodeHistory`와 `unreadPosts`를 합산·정렬해 새 배열을 생성함 — 카드를 펼치거나 접을 때마다 재계산.

**측정 결과 (perf.js 도구로 직접 측정):**

```
개선 전: 새로고침 1회 → ToonCard 3회 렌더 (초기 + 상태 갱신 2회)
개선 후: 새로고침 n회 → ToonCard 총 1회 렌더 (초기 마운트만)
```

**해결 방법:**

1. **React.memo + updatedAt 비교자** — `toon.updatedAt`이 바뀌지 않으면 리렌더 건너뜀

```js
export default memo(ToonCard, (prev, next) => {
  return prev.toon.updatedAt === next.toon.updatedAt;
});
```

2. **useMemo로 에피소드 목록 메모이제이션** — `episodeHistory` / `unreadPosts`가 바뀔 때만 재계산

```js
const episodes = useMemo(() => {
  const map = {};
  for (const h of toon.episodeHistory || []) map[h.episode] = h;
  for (const p of toon.unreadPosts || []) {
    if (!map[p.episode]) map[p.episode] = p;
  }
  return Object.values(map).sort((a, b) => a.episode - b.episode);
}, [toon.episodeHistory, toon.unreadPosts]);
```

3. **perf.js 측정 코드 `__DEV__` 가드** — 프로덕션에서는 완전 비활성, 개발 모드에서만 동작. 코드는 남겨두고 나중에 재사용 가능.

```js
export function markStart(label) {
  if (!__DEV__) return;  // 프로덕션에서는 no-op
  marks[label] = performance.now();
}
```

---

## #16 — 앱·서버 매칭 로직 분리로 인한 버그 누적

**날짜:** 2026-08-03

**증상:**

앱(`check-service.js`)에서 수정한 매칭 버그들(#11~#14)이 서버(`check-toons.js`)에는 그대로 남아있음. 서버는 구버전 로직으로 계속 동작하여 앱과 다른 결과를 냄.

**원인:**

앱과 서버가 동일한 매칭 로직을 각각 따로 작성하고 있었음. 한 쪽을 수정해도 다른 쪽이 자동으로 반영되지 않아 지속적으로 불일치 발생.

**해결 방법:**

공통 매칭 로직을 `src/utils/matchingUtils.js`로 추출 (CommonJS). 앱과 서버 모두 이 파일을 참조.

```
src/utils/matchingUtils.js  ← 단일 진실 공급원
    ↓ import              ↓ require
check-service.js        check-toons.js
(앱)                    (서버)
```

```js
// src/utils/matchingUtils.js
function buildSeriesKeys(seriesName) { ... }  // keyWords, minMatch 추출
function captionMatches(keyWords, minMatch, caption) { ... }  // 토큰 매칭
function ocrMatches(keyWords, minMatch, text) { ... }  // 서브스트링 매칭
module.exports = { buildSeriesKeys, captionMatches, ocrMatches };
```

**교훈:**

같은 로직을 두 곳에 따로 작성하면 반드시 한 쪽이 뒤처진다. CLAUDE.md 규칙 8번으로 추가됨.

---
