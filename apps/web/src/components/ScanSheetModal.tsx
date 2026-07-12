import { useEffect, useMemo, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { X, Camera, Image as ImageIcon, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import type { FeedProductDto, FeedingEntryDto } from '@aqualedger/contracts';
import { getCroppedImageDataUrl } from '@/lib/image';
import { recognizeCroppedTable, warmupOcr } from '@/lib/ocr';
import { parseSheetRows, type ParsedSheetRow } from '@/lib/sheetParser';
import { api } from '@/lib/api';
import { saveFeedingLocally } from '@/lib/sync';
import type { RecognitionResult } from 'ppu-paddle-ocr/web';

type ScanDraftMeal = { mealNumber: number; feedQuantityKg: string };
type ScanDraft = {
  feedingDate: string; // yyyy-mm-dd
  feedCode?: string;
  meals: ScanDraftMeal[]; // 1..5
};

export function ScanSheetModal(props: {
  isOpen: boolean;
  onClose: () => void;
  feedingDate: string;
  selectedFarmId: string;
  pondId: string;
  cultureCycleId: string;
  feedProducts: FeedProductDto[];
  existingEntry: FeedingEntryDto | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'pick' | 'crop' | 'review'>('pick');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScanDraft | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedSheetRow[]>([]);
  const [selectedRowDate, setSelectedRowDate] = useState<string | null>(null);
  const [lastOcrResults, setLastOcrResults] = useState<RecognitionResult[]>([]);
  const [lastOcrMeta, setLastOcrMeta] = useState<{ textLen: number; confidence: number; width: number; height: number } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugSending, setDebugSending] = useState(false);
  const [debugSent, setDebugSent] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractingProgress, setExtractingProgress] = useState(0);
  const [extractingStage, setExtractingStage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.isOpen) return;
    setStep('pick');
    setImageSrc(null);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    setCroppedAreaPixels(null);
    setCroppedPreview(null);
    setDraft(null);
    setParsedRows([]);
    setSelectedRowDate(null);
    setLastOcrResults([]);
    setLastOcrMeta(null);
    setShowDebug(false);
    setDebugSending(false);
    setDebugSent(false);
    setExtracting(false);
    setExtractingProgress(0);
    setExtractingStage(null);
    setSaving(false);
    setError(null);
  }, [props.isOpen]);

  const feedCodeOptions = useMemo(() => {
    const codes = props.feedProducts.map((p) => p.feedCode).filter(Boolean);
    return Array.from(new Set(codes)).slice(0, 6);
  }, [props.feedProducts]);

  const defaultFeedCode = useMemo(() => {
    return props.existingEntry?.feedCode || feedCodeOptions[0] || undefined;
  }, [props.existingEntry, feedCodeOptions]);

  const openFile = (capture?: 'environment') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.capture = capture;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || '');
        setImageSrc(url);
        setStep('crop');
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const onCropComplete = (_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  };

  const applyRowToDraft = (row: ParsedSheetRow | null) => {
    const meals: ScanDraftMeal[] = [1, 2, 3, 4, 5].map((n) => ({
      mealNumber: n,
      feedQuantityKg: row?.mealsKg[n as 1 | 2 | 3 | 4 | 5] || '',
    }));
    setDraft({
      feedingDate: row?.dateISO || props.feedingDate,
      feedCode: defaultFeedCode,
      meals,
    });
  };

  const handleExtract = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setError(null);
    setExtracting(true);
    setExtractingProgress(1);
    setExtractingStage(t('feeding.scan.stage.loadingModel'));

    let interval: number | null = null;
    const startFakeProgress = () => {
      const startedAt = Date.now();
      interval = window.setInterval(() => {
        setExtractingProgress((p) => {
          // Ease out: move quickly early, slow near 90%.
          const elapsed = Date.now() - startedAt;
          const step = elapsed < 4000 ? 4 : elapsed < 12000 ? 2 : 1;
          const next = Math.min(90, p + step);
          return next;
        });
      }, 450);
    };

    try {
      // Lazy warm-up: downloads/caches model on first use.
      await warmupOcr();
      setExtractingStage(t('feeding.scan.stage.preparingImage'));
      startFakeProgress();
      const preview = await getCroppedImageDataUrl(imageSrc, croppedAreaPixels);
      setCroppedPreview(preview);

      setExtractingStage(t('feeding.scan.stage.extractingText'));
      const ocrOut = await recognizeCroppedTable(preview);
      setLastOcrResults(ocrOut.results);
      setLastOcrMeta({
        textLen: ocrOut.text?.length || 0,
        confidence: ocrOut.confidence || 0,
        width: ocrOut.width || 0,
        height: ocrOut.height || 0,
      });
      setExtractingStage(t('feeding.scan.stage.parsingRows'));
      const rows = parseSheetRows(ocrOut.results);
      setParsedRows(rows);
      if (rows.length === 0) {
        setError(t('feeding.scan.noRows'));
        // Still go to review so user can see debug panel + retry crop.
        applyRowToDraft(null);
        setExtractingProgress(100);
        setStep('review');
        return;
      }

      const match = rows.find((r) => r.dateISO === props.feedingDate) || null;
      setSelectedRowDate(match?.dateISO || (rows[rows.length - 1]?.dateISO ?? null));
      applyRowToDraft(match);
      setExtractingProgress(100);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to prepare image');
    } finally {
      if (interval) window.clearInterval(interval);
      setExtracting(false);
      setExtractingStage(null);
    }
  };

  const setMealQty = (mealNumber: number, value: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      meals: draft.meals.map((m) => (m.mealNumber === mealNumber ? { ...m, feedQuantityKg: value } : m)),
    });
  };

  const setDraftFeedCode = (code: string) => {
    if (!draft) return;
    setDraft({ ...draft, feedCode: code });
  };

  const selectRow = (dateISO: string) => {
    setSelectedRowDate(dateISO);
    const row = parsedRows.find((r) => r.dateISO === dateISO) || null;
    applyRowToDraft(row);
  };

  const sendDebugToServer = async () => {
    setDebugSending(true);
    setDebugSent(false);
    try {
      await api.post('/debug/client-log', {
        feature: 'scan-sheet',
        selectedDate: props.feedingDate,
        parsedRowsCount: parsedRows.length,
        ocrItemsCount: lastOcrResults.length,
        cropPreviewBytes: croppedPreview ? croppedPreview.length : 0,
        ocrTextLen: lastOcrMeta?.textLen ?? null,
        ocrConfidence: lastOcrMeta?.confidence ?? null,
        cropWidth: lastOcrMeta?.width ?? null,
        cropHeight: lastOcrMeta?.height ?? null,
        sample: lastOcrResults
          .slice()
          .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
          .slice(0, 30)
          .map((r) => ({ text: r.text, conf: Number(r.confidence.toFixed(3)) })),
      });
      setDebugSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sync.failed'));
    } finally {
      setDebugSending(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const meals = draft.meals
        .map((m) => ({ ...m, feedQuantityKg: String(m.feedQuantityKg || '').trim() }))
        .filter((m) => m.feedQuantityKg !== '' && parseFloat(m.feedQuantityKg) > 0);

      if (meals.length === 0) {
        setError(t('feeding.scan.noMeals'));
        return;
      }

      const feedProduct = draft.feedCode
        ? props.feedProducts.find((p) => p.feedCode === draft.feedCode)
        : undefined;
      if (!feedProduct) {
        setError(t('feeding.scan.noFeedCode'));
        return;
      }

      if (props.existingEntry) {
        // Add only meals that don't exist yet.
        const existingNumbers = new Set(props.existingEntry.meals.map((m) => m.mealNumber));
        const toAdd = meals.filter((m) => !existingNumbers.has(m.mealNumber));
        for (const meal of toAdd) {
          await api.post<FeedingEntryDto>(`/feeding-entries/${props.existingEntry.id}/meals`, {
            mealNumber: meal.mealNumber,
            feedQuantityKg: meal.feedQuantityKg,
          });
        }
      } else {
        const entry = {
          clientEntryId: uuidv4(),
          farmId: props.selectedFarmId,
          pondId: props.pondId,
          cultureCycleId: props.cultureCycleId,
          feedingDate: draft.feedingDate,
          feedProductId: feedProduct.id,
          meals: meals.map((m) => ({
            mealNumber: m.mealNumber,
            feedQuantityKg: m.feedQuantityKg,
          })),
          deviceCreatedAt: new Date().toISOString(),
        };

        try {
          await api.post('/feeding-entries', entry);
        } catch {
          // For now: allow offline create only (matches existing app behavior)
          await saveFeedingLocally(entry, props.selectedFarmId);
        }
      }

      props.onSaved();
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sync.failed'));
    } finally {
      setSaving(false);
    }
  };

  if (!props.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
      <div className="w-full bg-background rounded-t-2xl p-4 pb-6 max-h-[92dvh] overflow-y-auto animate-slide-in-up">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium">{t('feeding.scan.title')}</p>
            <p className="text-xs text-text-secondary">{props.feedingDate}</p>
          </div>
          <button type="button" onClick={props.onClose} className="min-h-touch min-w-touch flex items-center justify-center">
            <X />
          </button>
        </div>

        {step === 'pick' && (
          <div className="space-y-3">
            <button type="button" onClick={() => openFile('environment')} className="btn-primary flex items-center justify-center gap-2">
              <Camera size={20} /> {t('feeding.scan.takePhoto')}
            </button>
            <button type="button" onClick={() => openFile()} className="btn-secondary flex items-center justify-center gap-2">
              <ImageIcon size={20} /> {t('feeding.scan.choosePhoto')}
            </button>
            <p className="text-xs text-text-secondary">
              {t('feeding.scan.note')}
            </p>
          </div>
        )}

        {step === 'crop' && imageSrc && (
          <div className="space-y-3">
            <div className="relative w-full h-[52vh] bg-black rounded-xl overflow-hidden">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={4 / 3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-secondary">{t('feeding.scan.zoom')}</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full"
              />
            </div>
            {error && <div className="card border-danger text-danger text-sm">{error}</div>}
            {extracting && (
              <div className="card space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{t('feeding.scan.extracting')}</span>
                  <span className="text-text-secondary">{Math.min(100, extractingProgress)}%</span>
                </div>
                <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-[width] duration-300"
                    style={{ width: `${Math.min(100, extractingProgress)}%` }}
                  />
                </div>
                {extractingStage && <p className="text-xs text-text-secondary">{extractingStage}</p>}
              </div>
            )}
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Wand2 size={20} /> {extracting ? t('feeding.scan.extracting') : t('feeding.scan.extract')}
            </button>
            <button type="button" onClick={() => setStep('pick')} className="btn-secondary">
              {t('common.back')}
            </button>
          </div>
        )}

        {step === 'review' && draft && (
          <div className="space-y-3">
            {croppedPreview && (
              <img src={croppedPreview} alt="Cropped" className="w-full rounded-xl border border-border" />
            )}

            {parsedRows.length > 0 && (
              <div className="card space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{t('feeding.scan.detectedRows')}</p>
                  {selectedRowDate !== props.feedingDate && (
                    <p className="text-xs text-warning">{t('feeding.scan.notMatched', { date: props.feedingDate })}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {parsedRows.slice(-14).map((r) => (
                    <button
                      key={r.dateISO}
                      type="button"
                      onClick={() => selectRow(r.dateISO)}
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        selectedRowDate === r.dateISO ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
                      }`}
                    >
                      {r.dateISO}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(error || parsedRows.length === 0) && (
              <div className="card space-y-2 border-warning">
                <p className="text-sm font-medium text-warning">{t('feeding.scan.helpTitle')}</p>
                <ul className="text-xs text-text-secondary list-disc pl-5 space-y-1">
                  <li>{t('feeding.scan.help1')}</li>
                  <li>{t('feeding.scan.help2')}</li>
                </ul>
                <button
                  type="button"
                  onClick={() => setShowDebug((s) => !s)}
                  className="text-sm font-medium text-primary text-left"
                >
                  {showDebug ? t('feeding.scan.hideDebug') : t('feeding.scan.showDebug')}
                </button>
                {showDebug && (
                  <div className="rounded-lg border border-border bg-surface p-3 text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">{t('feeding.scan.debug.ocrItems')}</span>
                      <span className="font-semibold">{lastOcrResults.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">{t('feeding.scan.debug.rows')}</span>
                      <span className="font-semibold">{parsedRows.length}</span>
                    </div>
                    <div>
                      <p className="text-text-secondary mb-1">{t('feeding.scan.debug.sample')}</p>
                      <div className="max-h-32 overflow-y-auto border border-border rounded p-2">
                        {lastOcrResults
                          .slice()
                          .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
                          .slice(0, 25)
                          .map((r, idx) => (
                            <div key={idx} className="flex justify-between gap-2">
                              <span className="truncate">{r.text}</span>
                              <span className="text-text-secondary shrink-0">{Math.round(r.confidence * 100)}%</span>
                            </div>
                          ))}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-border space-y-2">
                      <button
                        type="button"
                        onClick={sendDebugToServer}
                        disabled={debugSending}
                        className="btn-secondary !py-2 !text-sm"
                      >
                        {debugSending ? t('common.loading') : t('feeding.scan.debug.send')}
                      </button>
                      {debugSent && (
                        <p className="text-xs text-success">{t('feeding.scan.debug.sent')}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="card space-y-3">
              <div>
                <p className="label">{t('feeding.feedCode')}</p>
                <div className="flex gap-2 flex-wrap">
                  {feedCodeOptions.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setDraftFeedCode(code)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border ${
                        draft.feedCode === code ? 'bg-primary text-white border-primary' : 'bg-surface text-primary border-border'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {draft.meals.map((m) => (
                  <div key={m.mealNumber}>
                    <label className="label">{t('feeding.meal', { number: m.mealNumber })}</label>
                    <input
                      value={m.feedQuantityKg}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d*\.?\d{0,3}$/.test(v)) setMealQty(m.mealNumber, v);
                      }}
                      className="input-field text-base"
                      inputMode="decimal"
                      placeholder="0.0"
                    />
                  </div>
                ))}
              </div>
            </div>

            {error && <div className="card border-danger text-danger text-sm">{error}</div>}

            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? t('common.loading') : t('feeding.scan.applyAndSave')}
            </button>
            <button type="button" onClick={() => setStep('crop')} className="btn-secondary">
              {t('feeding.scan.retryCrop')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

