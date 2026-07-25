import { File, Paths } from 'expo-file-system';
import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';

export async function extractTextFromImage(imageUrl) {
  // Paths.cache는 Directory 객체 → .uri로 문자열 URI 추출
  const tempUri = Paths.cache.uri + `ocr_temp_${Date.now()}.jpg`;
  const tempFile = new File(tempUri);

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return '';
    const buffer = await response.arrayBuffer();
    tempFile.write(new Uint8Array(buffer));

    const result = await TextRecognition.recognize(tempFile.uri, TextRecognitionScript.KOREAN);
    const text = result.text || '';
    console.log('[OCR] 온디바이스 인식 결과:', text.slice(0, 100) || '(빈 텍스트)');
    return text;
  } catch (e) {
    console.warn('[OCR] 온디바이스 실패:', e.message);
    return '';
  } finally {
    try { tempFile.delete(); } catch {}
  }
}
