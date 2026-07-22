import { OCR_SPACE_KEY } from "../../config";

const OCR_URL = "https://api.ocr.space/parse/imageurl";

export async function extractTextFromImage(imageUrl) {
  if (!OCR_SPACE_KEY || OCR_SPACE_KEY.includes("여기에")) {
    console.warn("[OCR] OCR.space API 키가 설정되지 않았습니다.");
    return "";
  }

  try {
    const params = new URLSearchParams({
      apikey: OCR_SPACE_KEY,
      url: imageUrl,
      language: "kor",
      isOverlayRequired: "false",
      OCREngine: "3",
    });

    const res = await fetch(`${OCR_URL}?${params}`);
    const data = await res.json();

    if (res.status === 403 || res.status === 429) {
      console.warn("[OCR] 한도 초과 또는 권한 오류 (HTTP", res.status, ")");
      return null; // 한도 초과 sentinel
    }
    // 에러 응답 감지 (한도 초과, 키 오류 등)
    if (data.IsErroredOnProcessing) {
      const errMsg = data.ErrorMessage?.[0] || data.ErrorDetails || JSON.stringify(data.ErrorMessage);
      console.warn("[OCR] 처리 실패:", errMsg);
      // OCR.space가 200 OK에 limit 에러를 담아 보내는 경우도 sentinel 반환
      if (/limit|quota|exceeded/i.test(errMsg)) return null;
      return "";
    }

    const text = data.ParsedResults?.[0]?.ParsedText || "";
    console.log("[OCR] 인식 결과:", text.slice(0, 100) || "(빈 텍스트)");
    return text;
  } catch (e) {
    console.warn("[OCR] 실패:", e.message);
    return "";
  }
}
