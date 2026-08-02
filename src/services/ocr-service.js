import AsyncStorage from '@react-native-async-storage/async-storage';
import { OCR_SPACE_KEY } from '../../config';

const OCR_CACHE_KEY = 'ocr_cache_v1';

async function readCache() {
  try {
    const raw = await AsyncStorage.getItem(OCR_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeCache(cache) {
  try {
    await AsyncStorage.setItem(OCR_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export async function extractTextFromImage(imageUrl, postId) {
  if (postId) {
    const cache = await readCache();
    if (cache[postId] !== undefined) {
      console.log('[OCR] 캐시 히트 →', postId);
      return cache[postId];
    }
  }

  if (!OCR_SPACE_KEY) {
    console.warn('[OCR] API 키 없음');
    return '';
  }

  try {
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

    if (!res.ok) {
      console.warn('[OCR] 요청 실패:', res.status);
      return '';
    }

    const data = await res.json();
    if (data.IsErroredOnProcessing) {
      console.warn('[OCR] 처리 오류:', data.ErrorMessage);
      return '';
    }

    const text = (data.ParsedResults ?? [])
      .map((r) => r.ParsedText ?? '')
      .join('\n')
      .trim();

    console.log('[OCR] 인식 결과:', text.slice(0, 120) || '(빈 텍스트)');

    if (postId) {
      const cache = await readCache();
      cache[postId] = text;
      await writeCache(cache);
    }

    return text;
  } catch (e) {
    console.warn('[OCR] 실패:', e.message);
    return '';
  }
}
