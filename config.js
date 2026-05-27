// API 키는 app.config.js → extra → Constants.expoConfig.extra 경로로 주입됨
// 로컬 개발: .env.local / EAS 빌드: EAS Secrets
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const HASDATA_KEY = extra.HASDATA_KEY;
export const OCR_SPACE_KEY = extra.OCR_SPACE_KEY;
export const SUPABASE_URL = extra.SUPABASE_URL;
export const SUPABASE_ANON_KEY = extra.SUPABASE_ANON_KEY;
