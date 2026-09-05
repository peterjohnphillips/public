/** Voice discovery, wrapping the async getVoices()/onvoiceschanged quirk into
 * a Promise, plus Nepali-voice detection and fallback selection. */

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    // Some browsers populate the voice list asynchronously on first call.
    const handle = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handle);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", handle);
    // Fallback in case voiceschanged never fires (some browsers/OSes).
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", handle);
      resolve(window.speechSynthesis.getVoices());
    }, 1000);
  });
}

export function findNepaliVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return voices.find((v) => v.lang.toLowerCase().startsWith("ne")) ?? null;
}

export function findEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("en") && v.default) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

export function findVoiceByURI(voices: SpeechSynthesisVoice[], uri: string | null): SpeechSynthesisVoice | null {
  if (!uri) return null;
  return voices.find((v) => v.voiceURI === uri) ?? null;
}
