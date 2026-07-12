import { useTranslation } from 'react-i18next';

interface NumericQuantityInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  unit?: 'kg' | 'ton';
  autoFocus?: boolean;
}

export function NumericQuantityInput({
  value,
  onChange,
  label,
  unit = 'kg',
  autoFocus,
}: NumericQuantityInputProps) {
  const { t } = useTranslation();
  const unitLabel = unit === 'ton' ? t('common.ton') : t('common.kg');

  return (
    <div>
      {label && <label className="label">{label}</label>}
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.]?[0-9]*"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '' || /^\d*\.?\d{0,3}$/.test(v)) onChange(v);
          }}
          className="input-field text-3xl font-bold text-center pr-16"
          placeholder="0.0"
          autoFocus={autoFocus}
          aria-label={label || t('feeding.quantity')}
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary text-lg font-medium">
          {unitLabel}
        </span>
      </div>
    </div>
  );
}
