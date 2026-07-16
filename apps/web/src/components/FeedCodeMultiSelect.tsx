import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FeedProductDto } from '@aqualedger/contracts';

type FeedCodeMultiSelectProps = {
  products: FeedProductDto[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  allLabel?: string;
  className?: string;
};

export function FeedCodeMultiSelect({
  products,
  selectedIds,
  onChange,
  disabled,
  allLabel = 'All feeds',
  className = '',
}: FeedCodeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selectedCodes = products
    .filter((fp) => selectedIds.includes(fp.id))
    .map((fp) => fp.feedCode);
  const displayLabel =
    selectedCodes.length === 0 ? allLabel : selectedCodes.join(', ');

  const toggle = (productId: string, checked: boolean) => {
    if (checked) {
      onChange([...new Set([...selectedIds, productId])]);
      return;
    }
    onChange(selectedIds.filter((id) => id !== productId));
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="input-field w-full !py-2 !pl-3 !pr-8 !text-base font-medium text-left relative disabled:opacity-60"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate block">{displayLabel}</span>
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 w-full min-w-[140px] rounded-lg border border-border bg-surface shadow-lg py-1"
        >
          {products.map((fp) => {
            const checked = selectedIds.includes(fp.id);
            return (
              <label
                key={fp.id}
                className="flex items-center gap-2 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-primary-light/40 text-text"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => toggle(fp.id, event.target.checked)}
                  className="accent-primary shrink-0"
                />
                <span className="font-semibold">{fp.feedCode}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
