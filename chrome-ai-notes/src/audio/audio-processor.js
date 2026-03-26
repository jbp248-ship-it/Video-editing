/**
 * AudioWorklet processor — placeholder.
 * Will handle raw PCM data from the tab capture stream
 * and downsample to 16 kHz mono for Whisper.
 */

class AudioCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    // TODO: buffer PCM frames → downsample → post to main thread
    return true;
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
