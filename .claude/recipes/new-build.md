# 새 빌드 레시피

> 네이티브 변경이 있거나 환경변수가 바뀐 경우 사용합니다.

---

## iOS 빌드

### 사전 준비
- [ ] `app.config.js` → `version` 업데이트 (semver)
- [ ] `ios/toonnotifierapp/Info.plist` → `CFBundleVersion` +1 (Claude가 직접 수정)

### 빌드 실행
```bash
eas build --platform ios --profile production
```

### App Store 제출
```bash
eas submit --platform ios --latest
```

---

## Android 빌드

### 사전 준비
- [ ] `versionCode`가 Play Store 현재 버전보다 큰지 확인
  - 현재 최신 빌드 확인: `eas build:list --platform android --profile production --limit 3`

### 빌드 실행
```bash
eas build --platform android --profile production
```

### Play Console 업로드
1. EAS 대시보드에서 `.aab` 다운로드
2. Play Console → 비공개/프로덕션 트랙 → 새 출시 → AAB 업로드

---

## 빌드 후 OTA도 함께

JS 변경사항이 있다면 빌드 배포 후 OTA도 실행:
```bash
eas update --channel production --message "새 빌드와 함께 배포"
```

---

## 빌드 확인
```bash
eas build:list --platform all --limit 5
```
