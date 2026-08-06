# 데이터 모델

---

## toon 객체 (AsyncStorage)

```js
{
  id: string,              // UUID — 생성 후 변경 불가
  username: string,        // 인스타 계정명 (@ 제외)
  seriesName: string,      // 키워드 매칭 기준, 띄어쓰기 포함 가능
  lastEpisode: number,     // 감지된 최신 화수 (0 = 미감지)
  readEpisode: number,     // 사용자가 읽음 처리한 화수 (0 = 아무것도 안 읽음)
  hasNewEpisode: bool,     // unreadPosts.length > 0 이면 true
  isComplete: bool,        // 완결 확정 — true이면 자동 체크 제외
  pendingComplete: bool,   // 완결이지만 아직 읽지 않은 화수가 남아있음
  unreadPosts: [{ episode: number, url: string }],    // 읽지 않은 화수 (오름차순)
  episodeHistory: [{ episode: number, url: string }], // 읽은 화수 히스토리 (오름차순)
  lastPostId: string,      // 중복 감지용 (서버가 이 기준으로 신규 포스트 필터링)
  lastThumbnailUrl: string | null,
  lastPostUrl: string,
  lastEpisodeTitle: string,
  undetectable: bool,      // true이면 forceAll 수동 새로고침에서만 체크
  addedAt: string,         // ISO 8601
  updatedAt: string,
}
```

---

## 필드 업데이트 규칙

| 액션 | 업데이트되는 필드 |
|------|-----------------|
| 새 에피소드 감지 | `hasNewEpisode`, `lastEpisode`, `unreadPosts`, `lastPostId`, `lastPostUrl`, `lastThumbnailUrl` |
| 읽음 처리 (`advanceEpisode`) | `readEpisode`, `unreadPosts`, `hasNewEpisode`, `episodeHistory` |
| 알림 수신 (`applyNotificationUpdates`) | `hasNewEpisode`, `unreadPosts`, `isComplete` |
| Supabase 동기화 (`syncFromSupabase`) | 원격 `updated_at`이 로컬보다 최신일 때만 덮어씀 |
| 완결 처리 | `isComplete: true`, 이후 자동 체크 제외 |

---

## Supabase 스키마

**toons** 테이블:
```
id, username, series_name, last_episode, read_episode,
has_new_episode, unread_posts (JSONB), is_complete,
device_id, last_post_id, last_post_url, updated_at
```

**push_tokens** 테이블:
```
token, platform, device_id
```

---

## camelCase ↔ snake_case 매핑

| AsyncStorage (앱) | Supabase (서버/DB) |
|-------------------|-------------------|
| `seriesName` | `series_name` |
| `lastEpisode` | `last_episode` |
| `readEpisode` | `read_episode` |
| `hasNewEpisode` | `has_new_episode` |
| `unreadPosts` | `unread_posts` |
| `isComplete` | `is_complete` |
| `lastPostId` | `last_post_id` |
| `lastPostUrl` | `last_post_url` |
