/// <reference lib="webworker" />

import { PaddleOcrService } from 'ppu-paddle-ocr/web';
import type { FlattenedPaddleOcrResult, RecognitionResult } from 'ppu-paddle-ocr/web';
import { env } from 'onnxruntime-web';

// Ensure onnxruntime-web loads the correct WASM assets under Vite.
// If it fetches the wrong URL, the browser will try to compile HTML as WASM:
// "module doesn't start with '\\0asm'".
import ortWasmThreadedUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import ortMjsThreadedUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

env.wasm.wasmPaths = { wasm: ortWasmThreadedUrl, mjs: ortMjsThreadedUrl };

// Avoid SharedArrayBuffer requirement by using single thread.
env.wasm.numThreads = 1;

let service: PaddleOcrService | null = null;
let initializing: Promise<void> | null = null;

async function ensureService() {
  if (service && service.isInitialized()) return;
  if (!service) {
    console.log('[OCR Worker] Creating PaddleOcrService...');
    service = new PaddleOcrService({
      session: {
        // In browsers, use WASM explicitly for reliability.
        executionProviders: ['wasm'],
        executionMode: 'sequential',
        interOpNumThreads: 1,
        intraOpNumThreads: 1,
      },
      detection: {
        // A bit higher improves small handwriting detection.
        maxSideLength: 1280,
        // Keep small boxes (digits) instead of dropping them.
        minimumAreaThreshold: 5,
      },
      debugging: { verbose: true, debug: true },
      // NOTE: Do NOT set processing.engine='canvas-native' in workers - DOM canvas is unavailable.
      // Let the library use its default (which should handle ArrayBuffer input).
    });
  }
  if (!initializing) {
    console.log('[OCR Worker] Initializing service (loading models)...');
    initializing = service.initialize();
  }
  await initializing;
  console.log('[OCR Worker] Service initialized successfully');
}

async function recognize(dataUrl: string): Promise<{ results: RecognitionResult[]; text: string; confidence: number; width: number; height: number }> {
  console.log('[OCR Worker] recognize() called, dataUrl length:', dataUrl.length);
  await ensureService();

  // Convert data URL to ArrayBuffer
  console.log('[OCR Worker] Fetching image data...');
  const res = await fetch(dataUrl);
  const buffer = await res.arrayBuffer();
  console.log('[OCR Worker] ArrayBuffer size:', buffer.byteLength);

  // Try to decode image dimensions from the buffer (JPEG/PNG header)
  let width = 0;
  let height = 0;
  try {
    const view = new DataView(buffer);
    // Check for JPEG (starts with 0xFFD8)
    if (view.byteLength > 2 && view.getUint8(0) === 0xff && view.getUint8(1) === 0xd8) {
      // JPEG: scan for SOF0/SOF2 marker
      let offset = 2;
      while (offset < view.byteLength - 8) {
        if (view.getUint8(offset) === 0xff) {
          const marker = view.getUint8(offset + 1);
          // SOF0 (0xC0) or SOF2 (0xC2) contain dimensions
          if (marker === 0xc0 || marker === 0xc2) {
            height = view.getUint16(offset + 5);
            width = view.getUint16(offset + 7);
            break;
          }
          // Skip to next marker
          const len = view.getUint16(offset + 2);
          offset += 2 + len;
        } else {
          offset++;
        }
      }
    }
    // Check for PNG (starts with 0x89504E47)
    else if (view.byteLength > 24 && view.getUint32(0) === 0x89504e47) {
      width = view.getUint32(16);
      height = view.getUint32(20);
    }
    console.log('[OCR Worker] Decoded image dimensions:', width, 'x', height);
  } catch (e) {
    console.warn('[OCR Worker] Could not decode image dimensions:', e);
  }

  console.log('[OCR Worker] Calling service.recognize()...');
  try {
    const result = (await service!.recognize(buffer, { flatten: true })) as FlattenedPaddleOcrResult;
    console.log('[OCR Worker] Recognition complete. Results count:', result.results?.length ?? 0, 'Text length:', result.text?.length ?? 0);
    return {
      results: result.results || [],
      text: result.text || '',
      confidence: result.confidence || 0,
      width,
      height,
    };
  } catch (err) {
    console.error('[OCR Worker] service.recognize() threw:', err);
    throw err;
  }
}

type RequestMessage =
  | { type: 'recognize'; requestId: string; dataUrl: string }
  | { type: 'warmup'; requestId: string };

type ResponseMessage =
  | { type: 'ready'; requestId: string }
  | { type: 'recognized'; requestId: string; results: RecognitionResult[]; text: string; confidence: number; width: number; height: number }
  | { type: 'error'; requestId: string; message: string };

self.onmessage = async (e: MessageEvent<RequestMessage>) => {
  const msg = e.data;
  try {
    if (msg.type === 'warmup') {
      await ensureService();
      const res: ResponseMessage = { type: 'ready', requestId: msg.requestId };
      self.postMessage(res);
      return;
    }
    if (msg.type === 'recognize') {
      const out = await recognize(msg.dataUrl);
      const res: ResponseMessage = { type: 'recognized', requestId: msg.requestId, ...out };
      self.postMessage(res);
      return;
    }
  } catch (err) {
    const res: ResponseMessage = {
      type: 'error',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : 'OCR failed',
    };
    self.postMessage(res);
  }
};

