import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FeedProductDto } from '@aqualedger/contracts';

type FeedCodeCheckboxDropdownProps = {
  products: FeedProductDto[];
  selectedCodeIds: string[];
  rowProductId: string;
  rowKey: string;
  disabled?: boolean;
  onToggleCode: (productId: string, rowKey: string, mode: 'add' | 'remove') => void;
  onAssignRow: (productId: string) => void;
  placeholder?: string;
};

export function FeedCodeCheckboxDropdown({
  products,
  selectedCodeIds,
  rowProductId,
  rowKey,
  disabled,
  onToggleCode,
  onAssignRow,
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
  const selectedCodes = products
    .filter((fp) => selectedCodeIds.includes(fp.id))
    .map((fp) => fp.feedCode);
  const displayCode =
    rowCode || (selectedCodes.length > 0 ? selectedCodes.join(', ') : placeholder);

  const handleCheckboxChange = (productId: string, checked: boolean) => {
    if (checked) {
      onAssignRow(productId);
      if (!selectedCodeIds.includes(productId)) {
        onToggleCode(productId, rowKey, 'add');
      }
      return;
    }
    onToggleCode(productId, rowKey, 'remove');
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
            const checked = selectedCodeIds.includes(fp.id) || rowProductId === fp.id;
            const isRowCode = rowProductId === fp.id;
            return (
              <label
                key={fp.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-primary-light/40 ${
                  isRowCode ? 'font-semibold text-primary bg-primary-light/20' : 'text-text'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => handleCheckboxChange(fp.id, event.target.checked)}
                  className="accent-primary shrink-0"
                />
                <span>{fp.feedCode}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
