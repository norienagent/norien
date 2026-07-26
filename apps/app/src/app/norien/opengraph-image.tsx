import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = '$NORIEN — the Norien token';

const CREAM = '#F6F2EA';
const INK = '#2E261F';
const ACCENT = '#7A5A3A';

/** A branded coin card for the token page — drawn with Satori-safe primitives. */
export default function Image() {
  const bar = (w: number, o: number) => ({
    width: w,
    height: 22,
    borderRadius: 7,
    backgroundColor: CREAM,
    opacity: o,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 72,
          backgroundColor: CREAM,
          padding: '0 110px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Coin */}
        <div
          style={{
            width: 300,
            height: 300,
            borderRadius: 300,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            backgroundImage: `linear-gradient(160deg, #9C7C53, #5A4126)`,
            boxShadow: '0 30px 70px rgba(46,38,31,0.25)',
          }}
        >
          <div style={{ ...bar(72, 0.5), marginRight: 48 }} />
          <div style={{ ...bar(108, 0.78), marginRight: 12 }} />
          <div style={bar(144, 1)} />
        </div>

        {/* Text */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 92, fontWeight: 700, color: INK, letterSpacing: -2 }}>
            $NORIEN
          </div>
          <div style={{ display: 'flex', fontSize: 34, color: '#6C6257', marginTop: 14, maxWidth: 620, lineHeight: 1.3 }}>
            The utility token for the Norien network on Robinhood Chain.
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 34,
              alignItems: 'center',
              gap: 12,
              fontSize: 26,
              fontWeight: 600,
              color: '#3f6b47',
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 12, backgroundColor: '#3f6b47' }} />
            Live on Robinhood Chain
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
