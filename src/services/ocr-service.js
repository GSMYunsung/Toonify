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
      OCREngine: "2",
    });

    const res = await fetch(`${OCR_URL}?${params}`);
    const data = await res.json();

    const text = data.ParsedResults?.[0]?.ParsedText || "";
    console.log(text);
    console.log("[OCR] 인식 결과:", text.slice(0, 100));
    return text;
  } catch (e) {
    console.warn("[OCR] 실패:", e.message);
    return "";
  }
}
