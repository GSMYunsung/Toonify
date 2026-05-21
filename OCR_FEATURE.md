# 이미지 OCR 에피소드 감지 기능 구현 기록

## 1. 프로젝트 배경

**인스타툰 알림 앱**은 인스타그램에서 활동하는 웹툰 작가(@username)의 새 게시물을 주기적으로 확인해, 새 에피소드가 올라오면 푸시 알림을 보내주는 앱이다.

```
[앱 흐름]
사용자가 작가 계정 등록
    → 앱이 15~60초마다 인스타그램 포스트 조회
    → 새 에피소드 감지
    → 푸시 알림 발송
```

---

## 2. 문제 정의

### 기존 방식의 한계

기존 에피소드 감지는 **캡션(게시물 텍스트)** 에서만 화수를 추출한다.

```
캡션 예시 (잘 되는 경우):
  "하루툰 47화 🎉 오늘도 잘 부탁드려요!"
  → 정규식으로 "47" 추출 성공 ✅
```

하지만 일부 작가는 화수를 **이미지 안에 직접 그려넣는다.**

```
캡션 예시 (안 되는 경우):
  "하루툰 🎉 오늘도 잘 부탁드려요!"   ← 텍스트에 숫자 없음
  [이미지 안에 "47화" 라고 쓰여 있음]
  → 화수 추출 실패, 알림 미발송 ❌
```

---

## 3. 해결 방안 검토

| 방법 | 설명 | 비용 | 난이도 |
|------|------|------|--------|
| **방법 1** OCR (ML Kit) | 이미지에서 텍스트 직접 추출 | 무료 (온디바이스) | 중 |
| **방법 2** AI 이미지 분석 | Claude/GPT-4o에 이미지 전송 | API 호출마다 비용 | 하 |
| **방법 3** 포스트 ID 비교 | 화수 포기, 새 포스트 여부만 감지 | 무료 | 하 |
| **방법 4** 수동 입력 UI | 사용자가 직접 화수 입력 | 무료 | 하 |
| **방법 5** 캡션 + OCR + ID 하이브리드 | 1→2→3 순서로 순차 시도 | 무료 | 중 |

### 선택: 방법 5 (하이브리드)

- 기존 캡션 방식 유지 → 성능 손실 없음
- 캡션 실패 시에만 OCR 시도 → 불필요한 처리 최소화
- OCR도 실패하면 포스트 ID로 새 게시물 감지 → 놓치는 경우 없음
- Google ML Kit 사용으로 무료 + 온디바이스 처리

---

## 4. 구현 흐름

### 변경 전

```
checkToon()
├─ 포스트 조회
├─ 시리즈 키워드가 캡션에 있는지 확인
├─ 캡션에서 화수 추출 (regex)
│   └─ 실패하면 → skip (놓침 ❌)
└─ 새 화수면 알림 발송
```

### 변경 후

```
checkToon()
├─ 포스트 조회
├─ 시리즈 키워드가 캡션에 있는지 확인
├─ [1단계] 캡션에서 화수 추출 (regex)
├─ [2단계] 실패하면 → 썸네일 이미지 OCR 시도
│               └─ OCR 텍스트에서 화수 추출 (동일 regex 재사용)
├─ [3단계] OCR도 실패하면 → 포스트 ID가 바뀌었는지 확인
│               └─ 새 포스트면 "새 게시물" 알림 발송
└─ 새 화수 or 새 포스트 → 알림 발송 + 저장
```

---

## 5. 수정된 파일 목록

```
toon-notifier-app/
├─ src/
│   └─ services/
│       ├─ ocr-service.js        ← 신규 생성
│       └─ toon-service.js       ← 수정
└─ package.json                  ← 패키지 추가
```

---

## 6. 파일별 상세 설명

### 6-1. `src/services/ocr-service.js` (신규)

이미지 URL을 받아 텍스트를 추출해주는 단일 함수.

```js
import * as FileSystem from 'expo-file-system';
import TextRecognition from '@react-native-ml-kit/text-recognition';

export async function extractTextFromImage(imageUrl) {
  try {
    // 1. 인스타그램 CDN의 썸네일 이미지를 앱 로컬 캐시에 다운로드
    const localUri = FileSystem.cacheDirectory + 'ocr_thumb.jpg';
    await FileSystem.downloadAsync(imageUrl, localUri);

    // 2. Google ML Kit (Android) / Apple Vision (iOS) 로 텍스트 인식
    const result = await TextRecognition.recognize(localUri);
    return result.text || '';
  } catch {
    return ''; // 실패해도 빈 문자열 반환 → 다음 fallback으로 넘어감
  }
}
```

**왜 로컬에 저장하나?**
ML Kit은 HTTP URL을 직접 받지 못하고 로컬 파일 경로만 처리 가능하기 때문.

---

### 6-2. `src/services/toon-service.js` (수정)

핵심 에피소드 감지 로직이 있는 파일. 4곳을 수정했다.

#### 수정 1 — import 추가 (line 5)

```js
import { extractTextFromImage } from './ocr-service';
```

#### 수정 2 — `addToon()`: 포스트 ID 초기값 추가 (line 37)

```js
const newToon = {
  ...
  lastPostId: null,   // ← 추가: 포스트 ID fallback을 위한 필드
  ...
};
```

#### 수정 3 — `checkToon()`: 3단계 감지 로직 (lines 93~117)

```js
// [1단계] 캡션에서 화수 추출
let ep = extractEpisodeNumber(caption);

// [2단계] 실패하면 OCR 시도
if (ep === null) {
  const ocrText = await extractTextFromImage(post.thumbnailUrl);
  ep = extractEpisodeNumber(ocrText); // 기존 regex를 그대로 재사용
}

// [3단계] 새 화수 or 새 포스트 판단
const isNewEpisode = ep !== null && ep > (toon.lastEpisode || 0);
const isNewPost    = ep === null && post.id && post.id !== toon.lastPostId;

if (isNewEpisode || isNewPost) {
  await updateToon(toon.id, {
    hasNewEpisode: true,
    ...(isNewEpisode ? { lastEpisode: ep } : {}), // 화수 없으면 저장 안 함
    lastPostId: post.id,  // 항상 최신 포스트 ID 갱신
    ...
  });
  await sendLocalNotification(toon.seriesName, isNewEpisode ? ep : null);
}
```

#### 수정 4 — `sendLocalNotification()`: 화수 없을 때 메시지 분기 (lines 141~148)

```js
async function sendLocalNotification(seriesName, episode) {
  const body = episode != null
    ? `${episode}화가 올라왔어요. 지금 확인해보세요!`   // 화수 있을 때
    : `새 게시물이 올라왔어요. 지금 확인해보세요!`;    // 화수 없을 때
  ...
}
```

---

## 7. 추가된 패키지

| 패키지 | 용도 | 비용 |
|--------|------|------|
| `@react-native-ml-kit/text-recognition` | 온디바이스 OCR (iOS: Apple Vision, Android: Google ML Kit) | 무료 |
| `expo-file-system` | 이미지 URL → 로컬 파일 다운로드 | 무료 (Expo SDK 내장) |

---

## 8. 테스트 방법

`@react-native-ml-kit/text-recognition`은 네이티브 모듈이라 Expo Go에서 실행 불가.
반드시 **Development Build** 로 빌드해야 한다.

```bash
# 1. 네이티브 코드 생성
npx expo prebuild

# 2. 빌드 및 실행 (둘 중 하나)
npx expo run:ios
npx expo run:android

# 3. 앱에서 에피소드 번호를 이미지에 쓰는 작가 계정 추가

# 4. 당겨서 새로고침 후 로그 확인
#    성공 시: [checkToon] OCR로 화수 감지: 47
#    fallback: [checkToon] ep=null isNewPost=true
```

---

## 9. 감지 시나리오별 동작 정리

| 시나리오 | 캡션 | 이미지 | 결과 |
|----------|------|--------|------|
| 텍스트에 화수 있음 | "47화 업로드!" | - | 1단계에서 바로 감지 ✅ |
| 이미지에만 화수 있음 | "업로드!" | "47화" 그림 | 2단계 OCR로 감지 ✅ |
| 화수 표기 없음 | "안녕하세요" | 그림만 | 3단계 포스트 ID로 감지 ✅ |
| 완전히 동일한 포스트 | (동일) | (동일) | 알림 없음 (정상) ✅ |
