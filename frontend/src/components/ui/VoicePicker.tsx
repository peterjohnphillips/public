interface VoicePickerProps {
  voices: SpeechSynthesisVoice[];
  voiceAvailable: boolean;
  useFallbackVoice: boolean;
  selectedURI: string | null;
  onSelect: (uri: string | null) => void;
  onToggleFallback: (useFallback: boolean) => void;
  rate: number;
  onRateChange: (rate: number) => void;
}

/** Lets the user pick a voice, and surfaces the "no Nepali voice on this
 * system" fallback explicitly rather than silently reading nothing. */
export function VoicePicker({
  voices,
  voiceAvailable,
  useFallbackVoice,
  selectedURI,
  onSelect,
  onToggleFallback,
  rate,
  onRateChange,
}: VoicePickerProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
      {!voiceAvailable && (
        <span className="badge badge--due" title="No Nepali voice was found on this system">
          No Nepali voice available - reading romanization instead
        </span>
      )}
      {voiceAvailable && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
          <input
            type="checkbox"
            checked={useFallbackVoice}
            onChange={(e) => onToggleFallback(e.target.checked)}
          />
          Use English voice for romanization
        </label>
      )}
      {!useFallbackVoice && (
        <select
          value={selectedURI ?? ""}
          onChange={(e) => onSelect(e.target.value || null)}
          aria-label="Voice"
        >
          <option value="">Default Nepali voice</option>
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
        Speed
        <input
          type="range"
          min={0.5}
          max={1.2}
          step={0.05}
          value={rate}
          onChange={(e) => onRateChange(Number(e.target.value))}
        />
        {rate.toFixed(2)}x
      </label>
    </div>
  );
}
