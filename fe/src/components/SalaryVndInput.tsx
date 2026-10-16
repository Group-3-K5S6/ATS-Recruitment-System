import type { ChangeEvent } from 'react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import './SalaryVndInput.css';

// Lưu trong state chuỗi số nguyên không có dấu phân cách (ví dụ: "12000000").
// Chỉ thêm dấu chấm khi không nhập; lúc gõ giữ nguyên chuỗi chữ số để con trỏ ổn định.
const MAX_DIGITS = 15;

function formatVndDigits(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function valueHint(raw: string): string {
  if (!raw) return 'Nhập số tiền bằng VNĐ';
  const grouped = formatVndDigits(raw);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return `${grouped} đồng`;
  const decimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
  if (value >= 1_000_000_000 && value % 10_000_000 === 0) {
    return `${grouped} đồng (${decimal.format(value / 1_000_000_000)} tỷ)`;
  }
  if (value >= 1_000_000 && value % 10_000 === 0) {
    return `${grouped} đồng (${decimal.format(value / 1_000_000)} triệu)`;
  }
  if (value >= 1_000 && value % 1_000 === 0) {
    return `${grouped} đồng (${decimal.format(value / 1_000)} nghìn)`;
  }
  return `${grouped} đồng`;
}

type SalaryVndInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  label: string;
  placeholder?: string;
  theme?: 'blue' | 'green';
  disabled?: boolean;
};

export default function SalaryVndInput({
  value,
  onValueChange,
  name,
  label,
  placeholder = 'Ví dụ: 12.000.000',
  theme = 'blue',
  disabled = false,
}: SalaryVndInputProps) {
  const helpId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  // Khi bắt đầu chỉnh sửa, bỏ dấu chấm và chọn toàn bộ số cũ.
  // Chỉ thực hiện một lần lúc focus, không tự di chuyển con trỏ trong mỗi lần gõ.
  useLayoutEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const normalized = event.currentTarget.value
      .replace(/\D/g, '')
      .slice(0, MAX_DIGITS)
      .replace(/^0+(?=\d)/, '');
    onValueChange(normalized);
  }

  return (
    <div className={`ats-vnd-field ats-vnd-field--${theme}`}>
      <div className="ats-vnd-control">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          name={name}
          value={editing ? value : formatVndDigits(value)}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={handleInput}
          placeholder={placeholder}
          aria-label={label}
          aria-describedby={helpId}
          disabled={disabled}
        />
        <span className="ats-vnd-unit" aria-hidden="true">VNĐ</span>
      </div>
      <small id={helpId} className="ats-vnd-hint" aria-live="polite">{valueHint(value)}</small>
    </div>
  );
}
