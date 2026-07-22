import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FeedProductDto } from '@aqualedger/contracts';

type FeedCodeCheckboxDropdownProps = {
  products: FeedProductDto[];
  rowProductId: string;
  disabled?: boolean;
  onSelectCode: (productId: string) => void;
  placeholder?: string;
};

export function FeedCodeCheckboxDropdown({
  products,
  rowProductId,
  disabled,
  onSelectCode,
  placeholder = '—',
}: FeedCodeCheckboxDropdownProps) {
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

  const rowCode = products.find((fp) => fp.id === rowProductId)?.feedCode;
  const displayCode = rowCode || placeholder;

  const handleSelect = (productId: string) => {
    onSelectCode(productId);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="input-compact w-full !py-2 !pl-1.5 !pr-6 !text-sm font-semibold text-left relative disabled:opacity-60"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate block">{displayCode}</span>
        <ChevronDown
          size={12}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 min-w-full w-max max-w-[min(180px,calc(100vw-2rem))] rounded-lg border border-border bg-surface shadow-lg py-1"
        >
          {products.map((fp) => {
            const selected = rowProductId === fp.id;
            return (
              <button
                key={fp.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => handleSelect(fp.id)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-sm text-left hover:bg-primary-light/40 ${
                  selected ? 'font-semibold text-primary bg-primary-light/20' : 'text-text'
                }`}
              >
                <span
                  className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                    selected ? 'border-primary bg-primary' : 'border-border bg-surface'
                  }`}
                  aria-hidden
                />
                <span>{fp.feedCode}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
