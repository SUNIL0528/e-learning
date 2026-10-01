export type WavRecorder = {
  stop: () => Promise<File>;
  pause: () => void;
  resume: () => void;
};

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(
      44 + index * bytesPerSample,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function mergeChunks(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const samples = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return samples;
}

/**
 * Capture PCM from the microphone and encode it as a standard WAV file.
 * MediaRecorder codecs vary between browsers and can yield a tiny silent
 * WebM container even when the input device is working. PCM avoids that
 * codec/container mismatch and is natively playable by the audio element.
 */
export async function createWavRecorder(stream: MediaStream): Promise<WavRecorder> {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("This browser does not support microphone recording.");
  }

  const context = new AudioContextConstructor();
  try {
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const mute = context.createGain();
    const chunks: Float32Array[] = [];
    const sampleRate = context.sampleRate;
    let paused = false;
    let stopped = false;

    mute.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (!paused && !stopped) {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      }
    };

    // The processor must be connected to run. A zero-gain node prevents
    // microphone monitoring/echo while keeping the processing graph alive.
    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);

    return {
      pause: () => {
        paused = true;
      },
      resume: () => {
        paused = false;
      },
      stop: async () => {
        if (stopped) throw new Error("The recording has already ended.");
        stopped = true;
        processor.onaudioprocess = null;
        source.disconnect();
        processor.disconnect();
        mute.disconnect();
        const samples = mergeChunks(chunks);
        await context.close();

        if (!samples.length) {
          throw new Error(
            "No audio was captured. Check your microphone permission and input device.",
          );
        }

        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        if (peak < 0.0001) {
          throw new Error(
            "The microphone stream contains no audio. Check the browser input device and microphone permission.",
          );
        }

        const blob = encodeWav(samples, sampleRate);
        return new File([blob], `instructor-reply-${Date.now()}.wav`, { type: "audio/wav" });
      },
    };
  } catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
}
