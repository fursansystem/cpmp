// A short tone for a notification that arrives while the app is open. Generated with Web Audio, so there is no file
// to ship; browsers only allow it after the person has interacted with the page, and a refusal is ignored.
const mutedKey = (userId: string) => `notification-sound-muted-${userId}`;

export function isSoundMuted(userId: string): boolean {
  try {
    return localStorage.getItem(mutedKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function setSoundMuted(userId: string, muted: boolean) {
  try {
    localStorage.setItem(mutedKey(userId), muted ? "1" : "0");
  } catch {
    /* storage can be blocked */
  }
}

let audio: AudioContext | null = null;

// "action": something is waiting for you (two notes). "result": news that needs no action (one softer note).
export function playNotificationSound(kind: "action" | "result") {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    audio = audio ?? new Ctx();
    if (audio.state === "suspended") void audio.resume();
    const notes = kind === "action" ? [880, 1175] : [660];
    const start = audio.currentTime;
    notes.forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const at = start + i * 0.16;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(kind === "action" ? 0.18 : 0.1, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
      osc.connect(gain).connect(audio!.destination);
      osc.start(at);
      osc.stop(at + 0.3);
    });
  } catch {
    /* sound is a convenience, never an error */
  }
}
