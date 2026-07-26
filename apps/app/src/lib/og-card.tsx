import { ImageResponse } from 'next/og';

/**
 * Shared renderer for per-page Open Graph cards.
 *
 * One warm, brand-consistent 1200×630 card behind every token, agent, tool, and
 * skill page, so a shared link renders as a real Norien card rather than the
 * generic site image. Satori only supports a flexbox subset and no CSS
 * variables, so every value here is a literal — inline styles only.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

const CREAM = '#F6F2EA';
const INK = '#2E261F';
const MUTED = '#6C6257';
const ACCENT = '#7A5A3A';
const LINE = '#DDD2C2';

/** The stacked-bars mark, drawn with plain divs. */
function Mark() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ width: 30, height: 12, borderRadius: 3, backgroundColor: ACCENT, opacity: 0.45, marginLeft: 14 }} />
      <div style={{ width: 44, height: 12, borderRadius: 3, backgroundColor: ACCENT, opacity: 0.72, marginLeft: 7 }} />
      <div style={{ width: 58, height: 12, borderRadius: 3, backgroundColor: ACCENT }} />
    </div>
  );
}

export function ogCard(options: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  stats?: { label: string; value: string }[];
}) {
  const { eyebrow, title, subtitle, stats = [] } = options;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: CREAM,
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Mark />
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: INK, letterSpacing: -0.5 }}>
            nor<span style={{ color: ACCENT }}>ien</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: ACCENT,
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 76,
              fontWeight: 700,
              color: INK,
              letterSpacing: -1.5,
              marginTop: 18,
              lineHeight: 1.05,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div style={{ display: 'flex', fontSize: 30, color: MUTED, marginTop: 20, lineHeight: 1.3 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        {/* Stats row */}
        {stats.length > 0 ? (
          <div style={{ display: 'flex', gap: 56, borderTop: `1px solid ${LINE}`, paddingTop: 28 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontSize: 20, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {s.label}
                </div>
                <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: INK, marginTop: 6 }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', fontSize: 24, color: MUTED }}>norien.live · Robinhood Chain</div>
        )}
      </div>
    ),
    { ...OG_SIZE },
  );
}
