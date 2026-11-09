/// <reference lib="webworker" />
// MP3 encoding off the page's thread (see encodeMp3InWorker in utils/AudioExport.ts)
import { encodeMp3, type Mp3WorkerReply, type Mp3WorkerRequest } from './AudioExport';

const post = (m: Mp3WorkerReply, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);

self.onmessage = async (e: MessageEvent<Mp3WorkerRequest>) => {
  const { channels, sampleRate, kbps } = e.data;
  try {
    const parts = await encodeMp3(channels, sampleRate, { kbps, yieldEvery: 0, onProgress: progress => post({ progress }) });
    post({ parts }, parts.map(p => p.buffer));
  } catch (err) {
    post({ error: err instanceof Error ? err.message : String(err) });
  }
};
