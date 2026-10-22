import { describe, it, expect } from 'vitest';
import { mapPublicStatus } from '../src/modules/candidates/public-status-s4-05';

describe('S4-05: Tra cứu trạng thái hồ sơ', () => {
  it('Hồ sơ mới: Đã nhận', () => {
    expect(mapPublicStatus('APPLIED', 'ACTIVE').status).toBe('RECEIVED');
  });

  it('Đang sàng lọc: Đang xem xét', () => {
    expect(mapPublicStatus('SCREENING', 'ACTIVE').status).toBe('UNDER_REVIEW');
  });

  it('Đang xem xét', () => {
    expect(mapPublicStatus('UNDER_REVIEW', 'ACTIVE').status).toBe('UNDER_REVIEW');
  });

  it('Phỏng vấn: Mời phỏng vấn', () => {
    expect(mapPublicStatus('INTERVIEW', 'ACTIVE').status).toBe('INTERVIEW');
  });

  it('Đang phỏng vấn: Mời phỏng vấn', () => {
    expect(mapPublicStatus('INTERVIEWING', 'ACTIVE').status).toBe('INTERVIEW');
  });

  it('Đã từ chối: Kết thúc', () => {
    expect(mapPublicStatus('REJECTED', 'ACTIVE').status).toBe('COMPLETED');
  });

  it('Hồ sơ đóng: Kết thúc', () => {
    expect(mapPublicStatus('APPLIED', 'CLOSED').status).toBe('COMPLETED');
  });

  it('Giai đoạn không rõ: Đang xem xét', () => {
    expect(mapPublicStatus('UNKNOWN', 'ACTIVE').status).toBe('UNDER_REVIEW');
  });
});