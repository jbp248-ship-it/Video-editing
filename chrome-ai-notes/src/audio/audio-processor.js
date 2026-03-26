/**
 * AudioWorklet processor — high-performance PCM capture and downsample.
 *
 * Takes tab audio from inputs[0], mixes to mono, performs linear-interpolation
 * resampling from the hardware rate (44.1/48 kHz) to exactly 16,000 Hz, and
 * batches into 512-sample buffers before posting to minimize message overhead.
 *
 * Why 512 samples?
 *   At 16 kHz, 512 samples = 32 ms of audio. This is small enough for low
 *   latency but large enough to amortize postMessage serialization cost.
 *   The offscreen bridge aggregates these into 1-second chunks for Whisper.
 *
 * Messages IN:
 *   { type: "configure", sampleRate: number }  – hardware sample rate
 *   { type: "flush" }                          – ship remaining samples
 *
 * Messages OUT:
 *   { type: "samples", buffer: Float32Array }  – exactly 512 16kHz samples
 *   { type: "samples", buffer: Float32Array }  – <512 samples (flush only)
 *   { type: "flushed" }                        – flush complete signal
 */

const TARGET_SR = 16000;
const BATCH_SIZE = 512;

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Source sample rate — overridden by "configure" message
    this._srcRate = 48000;
    this._ratio = this._srcRate / TARGET_SR; // samples to skip per output sample

    // Pre-allocated output buffer (reused across process() calls)
    this._batch = new Float32Array(BATCH_SIZE);
    this._batchIdx = 0;

    // Fractional position in the source buffer — persists across process() calls
    // to maintain phase continuity at render quantum boundaries (128 frames).
    this._fracPos = 0;

    // Keep the last sample from the previous render quantum so we can
    // interpolate across the boundary without a discontinuity.
    this._prevTailSample = 0;

    this.port.onmessage = (e) => this._onMessage(e.data);
  }

  _onMessage(msg) {
    if (msg.type === "configure") {
      this._srcRate = msg.sampleRate;
      this._ratio = this._srcRate / TARGET_SR;
    } else if (msg.type === "flush") {
      this._flush();
    }
  }

  // ── Core DSP ──────────────────────────────────────────────────────────

  /**
   * Called every ~2.67 ms (128 frames at 48 kHz).
   * We must be fast here — no allocations, no branching on hot paths.
   */
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Mix all channels to mono in-place
    const mono = this._mixToMono(input);
    const srcLen = mono.length;
    const ratio = this._ratio;

    let pos = this._fracPos;
    let prevTail = this._prevTailSample;
    let bIdx = this._batchIdx;
    const batch = this._batch;

    while (pos < srcLen) {
      const intPos = pos | 0; // floor via bitwise — faster than Math.floor
      const frac = pos - intPos;

      // Current sample (always in bounds since pos < srcLen)
      const s0 = mono[intPos];

      // Next sample: either from this buffer or the saved tail from next call.
      // For the very last sample in the buffer, duplicate s0 (the offscreen
      // chunker smooths any micro-artifact at buffer boundaries).
      const s1 = intPos + 1 < srcLen ? mono[intPos + 1] : s0;

      // Linear interpolation: output = s0 + frac * (s1 - s0)
      batch[bIdx++] = s0 + frac * (s1 - s0);

      if (bIdx === BATCH_SIZE) {
        // Ship a full 512-sample batch via transferable ArrayBuffer
        const out = batch.slice();
        this.port.postMessage({ type: "samples", buffer: out }, [out.buffer]);
        bIdx = 0;
      }

      pos += ratio;
    }

    // Save state for next render quantum
    this._fracPos = pos - srcLen;
    this._prevTailSample = mono[srcLen - 1];
    this._batchIdx = bIdx;

    return true; // keep processor alive
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /**
   * Average all channels into mono. Optimized: skips allocation when
   * input is already mono (the common case for tab capture).
   */
  _mixToMono(channels) {
    if (channels.length === 1) return channels[0];

    const len = channels[0].length;
    const numCh = channels.length;
    const inv = 1 / numCh;
    // Reuse a scratch buffer to avoid per-call allocation
    if (!this._monoScratch || this._monoScratch.length < len) {
      this._monoScratch = new Float32Array(len);
    }
    const out = this._monoScratch;

    for (let i = 0; i < len; i++) {
      let sum = 0;
      for (let ch = 0; ch < numCh; ch++) {
        sum += channels[ch][i];
      }
      out[i] = sum * inv;
    }
    return out;
  }

  /**
   * Flush any remaining samples in the batch buffer (called when
   * recording stops, so we don't lose the tail end of audio).
   */
  _flush() {
    if (this._batchIdx > 0) {
      const remaining = this._batch.slice(0, this._batchIdx);
      this.port.postMessage(
        { type: "samples", buffer: remaining },
        [remaining.buffer]
      );
      this._batchIdx = 0;
    }
    this._fracPos = 0;
    this._prevTailSample = 0;
    this.port.postMessage({ type: "flushed" });
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
