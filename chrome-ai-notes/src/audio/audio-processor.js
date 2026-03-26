/**
 * AudioWorklet processor that captures raw PCM from a tab's audio stream,
 * downsamples from the source sample rate (typically 48 kHz) to 16 kHz mono,
 * and posts fixed-size chunks to the main thread for Whisper inference.
 *
 * Messages IN:
 *   { type: "configure", sampleRate: number }   – set source sample rate
 *   { type: "flush" }                           – flush remaining buffer
 *
 * Messages OUT:
 *   { type: "chunk", audio: Float32Array }      – 16 kHz mono PCM chunk
 *   { type: "flushed" }                         – flush complete
 */

const TARGET_SAMPLE_RATE = 16000;
// ~5 seconds of audio at 16 kHz per chunk — good balance between latency and
// Whisper throughput (tiny.en handles ≤30 s segments).
const CHUNK_FRAMES = TARGET_SAMPLE_RATE * 5; // 80 000 frames

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this._sourceSampleRate = 48000; // default, overridden by configure msg
    this._ratio = this._sourceSampleRate / TARGET_SAMPLE_RATE;

    // Ring buffer for downsampled 16 kHz samples
    this._buffer = new Float32Array(CHUNK_FRAMES);
    this._writeIndex = 0;

    // Fractional accumulator for the resampler
    this._resampleOffset = 0;

    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case "configure":
        this._sourceSampleRate = msg.sampleRate;
        this._ratio = this._sourceSampleRate / TARGET_SAMPLE_RATE;
        break;

      case "flush":
        this._flush();
        break;
    }
  }

  /**
   * Core DSP — called ~every 128 frames at the source sample rate.
   * inputs[0][0] = left channel Float32Array (mono capture).
   */
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;

    // Mix to mono if stereo
    const mono = this._mixToMono(input);

    // Linear-interpolation downsample
    this._downsampleAndBuffer(mono);

    return true; // keep processor alive
  }

  /**
   * Average all channels into a single mono buffer.
   */
  _mixToMono(channels) {
    if (channels.length === 1) return channels[0];

    const len = channels[0].length;
    const mixed = new Float32Array(len);
    const numCh = channels.length;

    for (let i = 0; i < len; i++) {
      let sum = 0;
      for (let ch = 0; ch < numCh; ch++) {
        sum += channels[ch][i];
      }
      mixed[i] = sum / numCh;
    }
    return mixed;
  }

  /**
   * Linear-interpolation resampler: walks through the source buffer at
   * fractional steps of (sourceSR / targetSR) and writes to the ring buffer.
   * When the ring buffer is full, it ships a chunk to the main thread.
   */
  _downsampleAndBuffer(source) {
    const ratio = this._ratio;
    const srcLen = source.length;
    let offset = this._resampleOffset;

    while (offset < srcLen) {
      const idx = Math.floor(offset);
      const frac = offset - idx;

      // Linear interpolation between adjacent samples
      const s0 = source[idx];
      const s1 = idx + 1 < srcLen ? source[idx + 1] : s0;
      const sample = s0 + frac * (s1 - s0);

      this._buffer[this._writeIndex++] = sample;

      if (this._writeIndex >= CHUNK_FRAMES) {
        this._shipChunk();
      }

      offset += ratio;
    }

    // Keep the fractional remainder for the next process() call
    this._resampleOffset = offset - srcLen;
  }

  /**
   * Send the full buffer as a chunk and reset.
   */
  _shipChunk() {
    this.port.postMessage(
      { type: "chunk", audio: this._buffer.slice(0, this._writeIndex) },
      // Transfer isn't possible with slice, but the copy is cheap at 80k floats
    );
    this._writeIndex = 0;
  }

  /**
   * Flush whatever remains in the buffer (e.g. when recording stops).
   */
  _flush() {
    if (this._writeIndex > 0) {
      this.port.postMessage({
        type: "chunk",
        audio: this._buffer.slice(0, this._writeIndex),
      });
      this._writeIndex = 0;
    }
    this.port.postMessage({ type: "flushed" });
    this._resampleOffset = 0;
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
