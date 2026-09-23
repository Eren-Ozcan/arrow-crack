/**
 * The music loop (`AUDIO.md` 3): one calm bed, mixed well under the effects.
 *
 * This is the one part of the audio that is **not** synthesised. Two
 * generated beds were tried — a pentatonic figure and a drone — and both were
 * rejected in play: an algorithm that is cheap enough to ship inline is also
 * shallow enough to notice, and a bed the player notices is the opposite of
 * what a bed is for. So the loop is a file, and it is the only asset in the
 * project with a licence line in `THIRD-PARTY-NOTICES.md`.
 *
 * The file is optional at runtime. Until one is dropped in, the game plays
 * its cues and nothing else, and no error reaches the player: a missing bed
 * is silence, never a broken screen.
 */

/**
 * Where the loop lives, served from `public/`. The first one that decodes
 * wins, and the format that actually ships is first in the list: the dev
 * server answers a missing path with the app's own HTML rather than a 404,
 * so a miss costs a decode attempt rather than a cheap status check.
 */
const SOURCES = ["/audio/music.mp3", "/audio/music.ogg", "/audio/music.m4a"];

export class MusicLoop {
  #context: AudioContext;
  #destination: AudioNode;
  #buffer: AudioBuffer | null = null;
  #source: AudioBufferSourceNode | null = null;
  /** Null until the first attempt; false once every source has failed. */
  #available: boolean | null = null;
  #wanted = false;

  constructor(context: AudioContext, destination: AudioNode) {
    this.#context = context;
    this.#destination = destination;
  }

  get playing(): boolean {
    return this.#source !== null;
  }

  /** True once a file has been found; false when none of the sources exist. */
  get available(): boolean | null {
    return this.#available;
  }

  start(): void {
    this.#wanted = true;
    if (this.#source) return;

    if (this.#buffer) {
      this.#play(this.#buffer);
      return;
    }
    if (this.#available === false) return;
    void this.#load();
  }

  stop(): void {
    this.#wanted = false;
    const source = this.#source;
    if (!source) return;

    this.#source = null;
    try {
      source.stop();
    } catch {
      // Already ended; a loop that stopped itself is not an error.
    }
  }

  async #load(): Promise<void> {
    for (const url of SOURCES) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;

        const bytes = await response.arrayBuffer();
        this.#buffer = await this.#context.decodeAudioData(bytes);
        this.#available = true;
        if (this.#wanted) this.#play(this.#buffer);
        return;
      } catch {
        // Missing, or not audio this browser decodes: try the next one.
      }
    }
    this.#available = false;
  }

  #play(buffer: AudioBuffer): void {
    const source = this.#context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.#destination);
    source.start();
    this.#source = source;
  }
}
