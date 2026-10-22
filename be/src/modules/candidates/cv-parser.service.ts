import { PDFParse } from 'pdf-parse';

export interface ExtractedCvData {
  fullName: string;
  email: string;
  phone: string;
  rawText: string;
  isParsed: boolean;
  message?: string;
  fieldsExtracted: {
    fullName: boolean;
    email: boolean;
    phone: boolean;
  };
}

export class CvParserService {
  /**
   * Kiểm tra magic bytes của PDF (%PDF - 0x25 0x50 0x44 0x46)
   */
  static isPdfBuffer(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 4) {
      return false;
    }
    // PDF signature begins with %PDF (hex 25 50 44 46)
    const header = buffer.subarray(0, 1024).toString('latin1');
    return header.includes('%PDF-');
  }

  /**
   * Bóc tách email từ nội dung văn bản
   */
  static extractEmail(text: string): string {
    const match = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i);
    return match ? match[0].trim().toLowerCase() : '';
  }

  /**
   * Bóc tách số điện thoại từ nội dung văn bản (hỗ trợ đầu số Việt Nam & quốc tế)
   */
  static extractPhone(text: string): string {
    // Ưu tiên định dạng số điện thoại Việt Nam: (+84|0)(3|5|7|8|9)x hoặc số 9-10 chữ số tiếp theo
    // Sử dụng [ .-] để tránh nuốt số trang ở dòng kế tiếp và gắn ranh giới \b
    const vnRegex = /(?:(?:\+?84|0)(?:[ .-]*\d){9,10})\b/g;
    const matches = text.match(vnRegex) || [];

    const firstMatch = matches[0];
    if (firstMatch) {
      // Làm sạch ký tự phân cách
      const cleaned = firstMatch.replace(/[ .-]+/g, '');
      if (cleaned.startsWith('84') && !cleaned.startsWith('+')) {
        return '+' + cleaned;
      }
      return cleaned;
    }

    // Fallback: Tìm dãy 10 chữ số tiêu chuẩn
    const fallbackMatch = text.match(/(?:(?:\+?\d{1,3}[ .-]*)?\(?\d{3}\)?[ .-]*\d{3}[ .-]*\d{4})\b/);
    if (fallbackMatch?.[0]) {
      return fallbackMatch[0].replace(/[ .-]+/g, '');
    }

    return '';
  }

  /**
   * Bóc tách họ và tên ứng viên từ danh sách các dòng văn bản
   */
  static extractFullName(lines: string[]): string {
    // Cách 1: Tìm dòng có nhãn chỉ rõ họ tên (VD: "Họ và tên: Nguyễn Văn A", "Full Name: John Doe", "Ho va ten:")
    for (const line of lines) {
      const labelMatch = line.match(
        /(?:h[oọ]\s*(?:v[aà]|&)?\s*t[eê]n|full\s*name|h[oọ]\s*t[eê]n|name|[uứ]ng\s*vi[eê]n)\s*[:\-\.]\s*(.+)/i
      );
      if (labelMatch && labelMatch[1]) {
        const candidate = labelMatch[1]
          .replace(/\s+(?:email|e-mail|phone|sđt|sdt|điện\s*thoại|tel|mobile|địa\s*chỉ|address)\b.*$/i, '')
          .replace(/[|;].*$/, '')
          .trim();
        if (candidate.length >= 2 && candidate.length <= 50 && !/@|\d/.test(candidate)) {
          return candidate;
        }
      }
    }

    // Danh sách từ khóa loại trừ khi quét tên ở các dòng đầu
    const blacklistRegex =
      /curriculum|resume|cv\b|sơ yếu|thông tin|liên hệ|mục tiêu|kinh nghiệm|học vấn|kỹ năng|dự án|chứng chỉ|vị trí|developer|engineer|designer|manager|intern|fresher|junior|senior|email|phone|điện thoại|địa chỉ|github|linkedin|facebook|http|www\.|tốt nghiệp|đại học|cao đẳng/i;

    // Cách 2: Quét qua 15 dòng đầu tiên để tìm tên ứng viên nổi bật
    for (const rawLine of lines.slice(0, 15)) {
      const line = rawLine.trim();
      if (!line || line.length < 3 || line.length > 50) continue;
      if (blacklistRegex.test(line)) continue;
      if (/@|\d|https?:|\.com/i.test(line)) continue;

      const words = line.split(/\s+/).filter(Boolean);
      // Một tên thông thường có từ 2 đến 5 từ
      if (words.length >= 2 && words.length <= 5) {
        // Mỗi từ gồm các chữ cái (hỗ trợ Unicode tiếng Việt có dấu)
        const isNameLike = words.every((word) => /^[A-Za-zÀ-ỹĐđ\.\-']+$/u.test(word));
        if (isNameLike) {
          return line;
        }
      }
    }

    return '';
  }

  /**
   * Trích xuất văn bản từ PDF buffer
   */
  static async extractTextFromPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const rawText = typeof result === 'string' ? result : result.text || '';
      return rawText;
    } finally {
      try {
        await parser.destroy();
      } catch {
        // ignore cleanup error
      }
    }
  }

  /**
   * Bóc tách toàn diện thông tin ứng viên từ PDF buffer
   */
  static async parseCv(buffer: Buffer, _filename?: string): Promise<ExtractedCvData> {
    // 1. Kiểm tra định dạng PDF
    if (!this.isPdfBuffer(buffer)) {
      throw new Error('INVALID_PDF_FORMAT');
    }

    let rawText = '';
    try {
      rawText = await this.extractTextFromPdf(buffer);
    } catch {
      // PDF không đọc được văn bản (ví dụ scan hoặc mã hóa)
      return {
        fullName: '',
        email: '',
        phone: '',
        rawText: '',
        isParsed: false,
        message: 'Không thể bóc tách nội dung từ tệp PDF này. Bạn vẫn có thể nhập thông tin ứng viên thủ công.',
        fieldsExtracted: {
          fullName: false,
          email: false,
          phone: false,
        },
      };
    }

    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const email = this.extractEmail(rawText);
    const phone = this.extractPhone(rawText);
    const fullName = this.extractFullName(lines);

    const hasAnyField = Boolean(fullName || email || phone);

    return {
      fullName,
      email,
      phone,
      rawText: rawText.slice(0, 2000), // lưu trích đoạn text phục vụ xác nhận
      isParsed: hasAnyField,
      message: hasAnyField
        ? 'Đã bóc tách thông tin từ CV thành công. Vui lòng kiểm tra và chỉnh sửa trước khi xác nhận lưu.'
        : 'Tệp PDF không chứa thông tin văn bản phù hợp. Bạn có thể nhập thông tin thủ công để tiếp tục.',
      fieldsExtracted: {
        fullName: Boolean(fullName),
        email: Boolean(email),
        phone: Boolean(phone),
      },
    };
  }
}
