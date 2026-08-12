import { FX_RANGES, type FxSettings } from '../lib/fx';
import { useFx } from '../state/fx-context';

interface Row {
  key: keyof FxSettings;
  label: string;
  /** 값 표기 포맷 */
  fmt: (v: number) => string;
}

const ROWS: readonly Row[] = [
  { key: 'fallSpeed', label: '낙하 속도', fmt: (v) => `${v.toFixed(1)}×` },
  { key: 'spawnIntervalMs', label: '생성 간격', fmt: (v) => `${Math.round(v)}ms` },
  { key: 'growDurationSec', label: '성장 시간', fmt: (v) => `${v.toFixed(1)}s` },
  { key: 'maxSizeRatio', label: '최대 크기 비율', fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'hue', label: '보라 톤', fmt: (v) => `${Math.round(v)}°` },
];

/**
 * 효과 설정 패널(SOO-1045).
 * 상단 로고 클릭으로만 열리고(키오스크 오조작 방지), 슬라이더 조절이 즉시 화면에 반영된다.
 */
export function FxPanel() {
  const { settings, update, reset, setOpen } = useFx();

  return (
    <div className="fx-panel-overlay" role="presentation" onClick={() => setOpen(false)}>
      <div
        className="fx-panel"
        role="dialog"
        aria-modal="true"
        aria-label="효과 설정"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fx-panel__head">
          <h2 className="fx-panel__title">효과 설정</h2>
          <button
            type="button"
            className="fx-panel__close"
            aria-label="효과 설정 닫기"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>

        {ROWS.map((row) => {
          const range = FX_RANGES[row.key];
          const id = `fx-${row.key}`;
          return (
            <div className="fx-row" key={row.key}>
              <label className="fx-row__label" htmlFor={id}>
                {row.label}
                <span className="fx-row__value">{row.fmt(settings[row.key])}</span>
              </label>
              <input
                id={id}
                className="fx-row__slider"
                type="range"
                min={range.min}
                max={range.max}
                step={range.step}
                value={settings[row.key]}
                onChange={(e) => update({ [row.key]: Number(e.target.value) })}
              />
            </div>
          );
        })}

        <button type="button" className="fx-panel__reset" onClick={reset}>
          기본값으로 초기화
        </button>
      </div>
    </div>
  );
}
