import { CalendarRange } from 'lucide-react';
import { fromLocalInput, presetRange, RANGE_PRESETS, toLocalInput, type RangePreset, type TimeRange } from '../lib/time';

export function TimeRangePicker({
  value,
  onChange,
  presets = RANGE_PRESETS.map((p) => p.value),
}: {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
  presets?: Exclude<RangePreset, 'custom'>[];
}) {
  const opts = RANGE_PRESETS.filter((p) => presets.includes(p.value));
  return (
    <div className="range-picker">
      <CalendarRange size={16} className="muted" aria-hidden />
      <select
        aria-label="Zakres czasu"
        value={value.preset}
        onChange={(e) => {
          const v = e.target.value as RangePreset;
          if (v === 'custom') onChange({ ...value, preset: 'custom' });
          else onChange(presetRange(v));
        }}
      >
        {opts.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
        <option value="custom">Własny zakres…</option>
      </select>
      {value.preset === 'custom' && (
        <>
          <input
            type="datetime-local"
            aria-label="Od"
            value={toLocalInput(value.from)}
            max={toLocalInput(value.to)}
            onChange={(e) => {
              const d = fromLocalInput(e.target.value);
              if (d && d < value.to) onChange({ ...value, from: d });
            }}
          />
          <span className="muted">–</span>
          <input
            type="datetime-local"
            aria-label="Do"
            value={toLocalInput(value.to)}
            min={toLocalInput(value.from)}
            onChange={(e) => {
              const d = fromLocalInput(e.target.value);
              if (d && d > value.from) onChange({ ...value, to: d });
            }}
          />
        </>
      )}
    </div>
  );
}
