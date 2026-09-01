# Toonify — AI Agent 행동 지침

> CLAUDE.md가 "무엇을 할지" 정의한다면, 이 파일은 "어떻게 생각하고 어떤 순서로 접근할지"를 정의합니다.
> 명령을 받으면 이 파일을 먼저 읽고, 태스크 유형에 맞는 파일을 추가로 참조하세요.

---

## 태스크별 참조 파일 맵

| 태스크 유형 | 추가로 읽을 파일 |
|-------------|-----------------|
| 에피소드 감지 로직 수정 | `.claude/skills/episode-detection.md` |
| 배포 방식 결정 | `.claude/skills/deploy-decision.md` |
| 새 기능 구현 | `.claude/templates/feature.md` → `.claude/recipes/new-feature.md` |
| 버그 수정 | `.claude/templates/bugfix.md` |
| OTA 배포 실행 | `.claude/recipes/ota-deploy.md` |
| 새 빌드 실행 | `.claude/recipes/new-build.md` |
| 코드 구조 파악 | `.claude/docs/architecture.md` |
| 데이터 모델 관련 작업 | `.claude/docs/data-model.md` |
| 코드 리뷰 / 품질 판단 | `.claude/docs/code-standards.md` |

---

## 모든 태스크 공통 원칙

1. **기존 함수 먼저 탐색** — 구현 전 `matchingUtils.js` → `check-service.js` → `toon-store.js` 순서로 유사 로직 확인
2. **공유 로직은 `src/utils/`** — 앱(`src/`)과 서버(`scripts/`)가 함께 쓰는 로직은 반드시 공유 파일로
3. **배포 전 자가검증** — `.claude/recipes/ota-deploy.md` 체크리스트 완료 후 배포
4. **TROUBLESHOOTING.md 기록** — 해결한 버그/문제는 반드시 기록
5. **작업 시작 전 리스크 등급 판단** — 아래 "리스크 기반 승인 게이트" 표를 먼저 확인

---

## 리스크 기반 승인 게이트

작업을 시작하기 전, 무엇을 건드리는지에 따라 승인 절차의 무게를 다르게 적용합니다.
모든 작업을 똑같이 무겁게 묶지 않고, 되돌리기 어렵거나 파급 범위가 큰 부분만 강하게 게이트합니다.

| 리스크 등급 | 해당 범위 | 절차 |
|---|---|---|
| **High** | `matchingUtils.js`, Supabase 스키마, `check-toons.js`(서버 배치), 배포 설정(`eas.json`, `app.config.js`) | 반드시 **Plan Mode**로 계획 작성 → 사용자 승인(ExitPlanMode) 후에만 구현 착수 |
| **Medium** | `check-service.js`, `toon-store.js`, `notifications.js` 등 서비스 레이어 | `.claude/templates/feature.md` 또는 `bugfix.md`를 채워 사용자에게 요약 확인을 받은 후 진행 (Plan Mode까지는 필수 아님) |
| **Low** | UI 컴포넌트 스타일, 텍스트 문구, 단순 리팩터링 | 바로 진행 가능, 완료 후 결과만 보고 |

- **배포(OTA/빌드)는 변경 크기와 무관하게 항상 High로 취급** — 되돌리기 어렵기 때문
- 등급 판단이 애매하면 상위 등급(더 신중한 쪽)으로 처리

---

## 역할 분리 (researcher / planner / reviewer)

작업은 탐색 → 계획 → 구현 → 검증의 흐름을 따르고, 각 단계는 서로 다른 역할이 담당합니다.

```
탐색(researcher)  →  계획(planner)  →  구현  →  검증(reviewer)
```

| 역할 | 담당 | 언제 호출 |
|------|------|-----------|
| **researcher** | `toon-researcher` 서브에이전트 (읽기 전용) | 구현 전 기존 로직·중복 여부 확인이 필요할 때. 특히 Medium/High 등급 작업 |
| **planner** | Claude Code 기본 **Plan Mode** | High 등급 작업, 또는 사용자 승인이 필요한 변경 범위/리스크 분석 |
| **reviewer** | `toon-reviewer` 서브에이전트 | 구현 완료 후, 배포 전 자가검증 단계에서 (`.claude/recipes/ota-deploy.md`, `new-feature.md`의 검증 단계를 대체) |

researcher와 reviewer 정의는 `.claude/agents/toon-researcher.md`, `.claude/agents/toon-reviewer.md` 참고.

---

## 로그 / 추적성

- **자동 로그** (`.claude/logs/agent-activity.jsonl`, gitignore 대상) — hooks로 자동 기록되는 raw 도구 사용 로그
  (어떤 파일에 어떤 도구가 언제 실행됐는지). 재연성 확인·디버깅용, 커밋하지 않음.
- **`TROUBLESHOOTING.md`** — 사람이 정제해서 쓰는 지식 베이스. 증상/원인/해결 방법 위주로 기록, 커밋 대상.
- 자동 로그는 "무슨 일이 있었는지"의 원본 기록, TROUBLESHOOTING.md는 "무엇을 배웠는지"의 요약. 둘은 서로 대체하지 않음.

---

## 작업 완료 후 — 정의서 동기화

**모든 작업이 끝나면 변경 내용이 .claude/ 정의서와 일치하는지 확인하고 업데이트하세요.**

| 변경 내용 | 업데이트할 파일 |
|-----------|----------------|
| 새 기능 추가 / 서비스 구조 변경 | `.claude/docs/architecture.md` |
| toon 객체 필드 추가·변경 / Supabase 스키마 변경 | `.claude/docs/data-model.md` |
| 새 금지 패턴 또는 새 공통 함수 발견 | `.claude/docs/code-standards.md` |
| 에피소드 감지 로직 변경 / 새 엣지케이스 발견 | `.claude/skills/episode-detection.md` |
| 배포 규칙 변경 (OTA 조건, 버전 규칙 등) | `.claude/skills/deploy-decision.md` |
| 배포 절차 변경 | `.claude/recipes/ota-deploy.md` 또는 `new-build.md` |
| 개발 워크플로우 변경 | `.claude/recipes/new-feature.md` |
| 새 반복 작업 패턴 생김 | 해당 recipe 파일 추가 |

정의서가 코드 현실과 어긋나면 다음 작업 시 잘못된 전제로 시작하게 됩니다.

---

## 금지 행동 (절대 하지 말 것)

- API 키, 환경변수를 코드에 직접 하드코딩
- 동일 로직을 두 파일에 따로 작성하거나 복붙
- 자가검증 없이 OTA 배포 실행
- `check-service.js` / `matchingUtils.js` 수정 후 테스트 케이스 추가 없이 배포

---

## 디렉토리 역할 요약

```
AGENTS.md          ← 이 파일: 태스크 라우팅 + 공통 원칙
CLAUDE.md          ← 핵심 업무 지시서 (기술 스택, 데이터 모델, 기능 명세)

.claude/
├── skills/        ← 특정 도메인에서 어떻게 생각할지
├── docs/          ← 무엇을 좋은 코드/구조로 볼지 (레퍼런스)
├── templates/     ← 구현 전에 무엇을 정의할지 (빈칸 채우기)
└── recipes/       ← 반복 작업을 어떤 순서로 할지 (체크리스트)

scripts/
├── check-toons.js        ← 서버 배치 (GitHub Actions)
└── test-check-toons.js   ← 에피소드 감지 테스트
```
