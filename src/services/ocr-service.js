import { File, Paths } from 'expo-file-system';
import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';

export async function extractTextFromImage(imageUrl) {
  const tempUri = Paths.cache.uri + `ocr_temp_${Date.now()}.jpg`;
  const tempFile = new File(tempUri);

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return '';
    const buffer = await response.arrayBuffer();
    tempFile.write(new Uint8Array(buffer));

    // KOREAN + LATIN 병렬 실행 — 한글은 KOREAN, 숫자/영문은 LATIN이 정확
    const [krResult, laResult] = await Promise.all([
      TextRecognition.recognize(tempFile.uri, TextRecognitionScript.KOREAN),
      TextRecognition.recognize(tempFile.uri, TextRecognitionScript.LATIN),
    ]);

    const krText = krResult.text || '';
    const laText = laResult.text || '';

    const krLines = new Set(krText.split('\n').map((l) => l.trim()).filter(Boolean));
    const extra = laText.split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !krLines.has(l))
      .join('\n');

    const text = (krText + (extra ? '\n' + extra : '')).trim();
    console.log('[OCR] 인식 결과:', text.slice(0, 120) || '(빈 텍스트)');
    return text;
  } catch (e) {
    console.warn('[OCR] 온디바이스 실패:', e.message);
    return '';
  } finally {
    try { tempFile.delete(); } catch {}
  }
}
