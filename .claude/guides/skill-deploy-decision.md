# 배포 결정 — OTA vs 새 빌드

배포 전에 이 파일로 방식을 먼저 결정하세요.

---

## 결정 트리

```
변경 사항 확인
    ↓
네이티브 변경?
(ios/, android/, 새 네이티브 패키지, app.config.js 플러그인, 환경변수 추가)
    ├─ Yes → 새 빌드 필요 → .claude/guides/recipe-new-build.md
    └─ No  → JS/TS만 변경 → OTA 가능 → .claude/guides/recipe-ota-deploy.md
```

---

## OTA 가능한 변경

- `src/` 하위 모든 파일 (screens, components, services, utils, hooks)
- `scripts/` 하위 파일 (서버 배치, 테스트)
- `App.js` 로직 수정 (네이티브 설정 제외)

## 새 빌드가 필요한 변경

- 새 네이티브 모듈 설치 (npm install 후 네이티브 코드 포함)
- `app.config.js` 플러그인 추가/변경
- `ios/`, `android/` 직접 수정
- `EXPO_PUBLIC_*` 환경변수 추가/변경
- `expo-notifications` 설정 변경
- Expo SDK 업그레이드

---

## 버전 규칙

| 플랫폼 | 규칙 |
|--------|------|
| iOS `CFBundleVersion` | 빌드 전 Claude가 직접 +1 올림 |
| Android `versionCode` | Play Store 이전 업로드보다 반드시 커야 함 |
| `version` (semver) | 기능 추가 → minor, 버그픽스 → patch |

---

## OTA 업데이트 적용 시점

- 정책: `checkAutomatically: "ON_LOAD"` — 앱 실행 시 확인
- 적용: **다음 실행부터** (즉시 적용 아님)
- 사용자는 앱을 껐다 켜야 업데이트 적용됨
