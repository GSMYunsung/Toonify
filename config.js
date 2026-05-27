// EXPO_PUBLIC_ 접두사 변수는 Metro가 빌드 시 직접 번들에 인라인 치환함
// 로컬 개발: .env.local / EAS 빌드: EAS Secrets (EXPO_PUBLIC_ 접두사)
export const HASDATA_KEY = process.env.EXPO_PUBLIC_HASDATA_KEY;
export const OCR_SPACE_KEY = process.env.EXPO_PUBLIC_OCR_SPACE_KEY;
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
