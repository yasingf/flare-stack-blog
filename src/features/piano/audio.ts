type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  pitch: number;
  live: boolean;
  released: boolean;
};
const roots = [23, ...Array.from({ length: 29 }, (_, i) => 24 + i * 3)];
const sampleRoot = (pitch: number) =>
  roots.reduce((a, b) => (Math.abs(pitch - a) <= Math.abs(pitch - b) ? a : b));
const layerFor = (velocity: number) =>
  velocity < 0.4 ? "pp" : velocity < 0.78 ? "mf" : "ff";

/** One audio context, a bounded voice pool and reusable decoded samples. */
export class GrandPiano {
  private context?: AudioContext;
  private output?: GainNode;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private voices = new Set<Voice>();
  private sustain = false;
  private volume = 0.7;
  private generation = 0;
  private liveVersions = new Map<number, number>();
  private clicks = new Set<OscillatorNode>();
  async ready() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.output = this.context.createGain();
      this.output.gain.value = this.volume;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.ratio.value = 6;
      this.output.connect(compressor).connect(this.context.destination);
    }
    if (this.context.state !== "running") await this.context.resume();
  }
  private sample(pitch: number, velocity: number) {
    const root = sampleRoot(pitch),
      layer = layerFor(velocity);
    const key = `${root}-${layer}`;
    if (!this.buffers.has(key)) {
      const task = fetch(`/piano/steinway/${key}.mp3`)
        .then(async (response) => {
          if (!response.ok)
            throw new Error("钢琴音源加载失败，请检查网络后重试。");
          return this.context!.decodeAudioData(await response.arrayBuffer());
        })
        .catch((error: unknown) => {
          this.buffers.delete(key);
          throw error;
        });
      this.buffers.set(key, task);
    }
    return { root, buffer: this.buffers.get(key)! };
  }
  async preload(notes: { pitch: number; velocity: number }[]) {
    await this.ready();
    // Queue unique samples in small batches instead of opening 90 connections.
    const unique = new Map(
      notes.map((n) => [`${sampleRoot(n.pitch)}-${layerFor(n.velocity)}`, n]),
    );
    const tasks = [...unique.values()];
    for (let i = 0; i < tasks.length; i += 6)
      await Promise.all(
        tasks
          .slice(i, i + 6)
          .map((n) => this.sample(n.pitch, n.velocity).buffer),
      );
  }
  setVolume(volume: number) {
    this.volume = volume;
    if (this.output && this.context)
      this.output.gain.setTargetAtTime(volume, this.context.currentTime, 0.03);
  }
  async play(
    pitch: number,
    velocity: number,
    duration?: number,
    delay = 0,
    live = false,
  ) {
    if (!this.context || !this.output) return;
    const generation = this.generation;
    const liveVersion = this.liveVersions.get(pitch) || 0;
    const { root, buffer } = this.sample(pitch, velocity);
    const decoded = await buffer;
    if (
      !this.context ||
      this.context.state === "closed" ||
      generation !== this.generation ||
      (live && liveVersion !== (this.liveVersions.get(pitch) || 0))
    )
      return;
    const start = this.context.currentTime + Math.max(0, delay);
    const source = this.context.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = 2 ** ((pitch - root) / 12);
    const gain = this.context.createGain();
    // Keep the recorded dynamic layers; only make a modest adjustment within each layer.
    const level = 0.5 + velocity * 0.5;
    gain.gain.setValueAtTime(level, start);
    source.connect(gain).connect(this.output);
    const voice: Voice = { source, gain, pitch, live, released: false };
    if (this.voices.size >= 96)
      this.releaseVoice(this.voices.values().next().value!);
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      gain.disconnect();
    };
    source.start(start);
    if (duration !== undefined) {
      const end = start + Math.max(0.04, duration);
      gain.gain.setTargetAtTime(0.0001, end, 0.075);
      source.stop(end + 0.5);
    }
  }
  private releaseVoice(voice: Voice) {
    if (!this.context) return;
    voice.gain.gain.cancelScheduledValues(this.context.currentTime);
    voice.gain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.055);
    try {
      voice.source.stop(this.context.currentTime + 0.3);
    } catch {
      /* Already ended. */
    }
    this.voices.delete(voice);
  }
  noteOff(pitch: number) {
    this.liveVersions.set(pitch, (this.liveVersions.get(pitch) || 0) + 1);
    for (const v of this.voices)
      if (v.live && v.pitch === pitch) {
        v.released = true;
        if (!this.sustain) this.releaseVoice(v);
      }
  }
  pedal(down: boolean) {
    this.sustain = down;
    if (!down)
      for (const v of this.voices) if (v.released) this.releaseVoice(v);
  }
  click(accent: boolean, delay = 0) {
    if (!this.context || !this.output) return;
    const start = this.context.currentTime + delay;
    const source = this.context.createOscillator();
    const gain = this.context.createGain();
    source.frequency.value = accent ? 1350 : 900;
    gain.gain.setValueAtTime(0.09, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);
    source.connect(gain).connect(this.output);
    source.start(start);
    source.stop(start + 0.05);
    this.clicks.add(source);
    source.onended = () => {
      this.clicks.delete(source);
      source.disconnect();
      gain.disconnect();
    };
  }
  stop() {
    this.generation++;
    for (const voice of this.voices) this.releaseVoice(voice);
    for (const click of this.clicks) {
      try {
        click.stop();
      } catch {
        /* Ended. */
      }
    }
    this.clicks.clear();
    this.sustain = false;
  }
  async dispose() {
    this.stop();
    await this.context?.close();
    this.context = undefined;
    this.buffers.clear();
  }
}
