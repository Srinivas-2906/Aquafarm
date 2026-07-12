import type { RecognitionResult } from 'ppu-paddle-ocr/web';
import { v4 as uuidv4 } from 'uuid';

type WorkerRequest =
  | { type: 'warmup'; requestId: string }
  | { type: 'recognize'; requestId: string; dataUrl: string };

type WorkerResponse =
  | { type: 'ready'; requestId: string }
  | { type: 'recognized'; requestId: string; results: RecognitionResult[]; text: string; confidence: number; width: number; height: number }
  | { type: 'error'; requestId: string; message: string };

let worker: Worker | null = null;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/paddle-ocr.worker.ts', import.meta.url), {
    type: 'module',
  });
  return worker;
}

function callWorker<T extends WorkerResponse['type']>(
  req: WorkerRequest,
  expect: T,
): Promise<Extract<WorkerResponse, { type: T }>> {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.requestId !== req.requestId) return;
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (e.data.type === 'error') reject(new Error(e.data.message));
      else if (e.data.type !== expect) reject(new Error('Unexpected OCR response'));
      else resolve(e.data as Extract<WorkerResponse, { type: T }>);
    };
    const onError = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      reject(new Error('OCR worker crashed'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage(req);
  });
}

export async function warmupOcr(): Promise<void> {
  const requestId = uuidv4();
  await callWorker({ type: 'warmup', requestId }, 'ready');
}

export async function recognizeCroppedTable(dataUrl: string): Promise<{ results: RecognitionResult[]; text: string; confidence: number; width: number; height: number }> {
  const requestId = uuidv4();
  const res = await callWorker({ type: 'recognize', requestId, dataUrl }, 'recognized');
  return { results: res.results, text: res.text, confidence: res.confidence, width: res.width, height: res.height };
}

