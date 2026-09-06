import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

interface DecimalInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
}

/**
 * Text-based numeric input that keeps the raw string while typing so partial
 * values like "0." or "0.05" are never clobbered by number parsing.
 */
export function DecimalInput({ value, onValueChange, ...props }: DecimalInputProps) {
  const [text, setText] = useState(value === null || value === undefined || value === 0 ? '' : String(value));

  useEffect(() => {
    const parsed = parseFloat(text);
    const current = value ?? 0;
    if (parsed !== current && !(isNaN(parsed) && current === 0)) {
      setText(current === 0 ? '' : String(current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '' || /^[0-9]*\.?[0-9]*$/.test(raw)) {
          setText(raw);
          const num = parseFloat(raw);
          onValueChange(isNaN(num) ? 0 : num);
        }
      }}
    />
  );
}
