import { Link } from 'react-router-dom'
import { BRAND, SunMark } from '../components/brand'

/**
 * Public "exhibition poster" hero (Glacier template, adapted to ADENSA).
 *
 * Layout follows Scrolltide's Glacier composition: centred brand lockup,
 * two-line headline (light over bold), subtitle, a true-ellipse
 * CTA, and a thin footer bar — on a self-contained dark canvas, so the
 * console theme never bleeds in and this page never bleeds out.
 *
 * All motion is pure CSS with the original's pacing (0.7–0.85s entrances,
 * delays 0.1–0.8s, glacial background drift) and parks itself under
 * prefers-reduced-motion. No framer-motion, no video.
 */

const CREAM = BRAND.ivory
const GOLD = BRAND.gold

const label: React.CSSProperties = {
  fontSize: '10.5px',
  fontWeight: 500,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'rgba(245,239,230,0.6)',
  fontFamily: "'Inter', sans-serif",
  textDecoration: 'none',
}

export default function WelcomePage() {
  return (
    <section
      aria-labelledby="welcome-title"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100svh',
        overflow: 'hidden',
        background: '#0A1220',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ---- Background: the drifting night field that replaces the stock
          video — deep navy base, a slow blue aurora and an opposed gold
          ember, both cheap fixed-size gradients on GPU transforms. ---- */}
      <div
        aria-hidden="true"
        className="w-glow-a"
        style={{
          position: 'absolute',
          top: '-14%',
          left: '50%',
          marginLeft: '-520px',
          width: '1040px',
          height: '740px',
          background:
            'radial-gradient(ellipse at 50% 32%, rgba(47,111,219,0.22) 0%, rgba(14,27,44,0.12) 44%, transparent 68%)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        className="w-glow-b"
        style={{
          position: 'absolute',
          right: '-12%',
          bottom: '-18%',
          width: '900px',
          height: '640px',
          background:
            'radial-gradient(ellipse at 60% 60%, rgba(212,162,30,0.14) 0%, transparent 62%)',
          pointerEvents: 'none',
        }}
      />
      {/* Vignette — keeps type and footer bar framed over the glows. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to bottom, rgba(7,13,28,0.48) 0%, transparent 28%, transparent 58%, rgba(7,13,28,0.62) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* ---- Centred lockup ---- */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '96px 24px 120px',
        }}
      >
        {/* Brand */}
        <div
          className="w-fade-up"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '26px',
            animationDuration: '0.7s',
            animationDelay: '0.1s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
            <SunMark tone="night" className="h-7 w-auto" />
            <span
              style={{
                fontSize: '15px',
                fontWeight: 500,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: CREAM,
                fontFamily: "'Inter', sans-serif",
                paddingLeft: '0.28em' /* offsets the trailing letter-space, keeps optical centring */,
              }}
            >
              Adensa
            </span>
          </div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 500,
              letterSpacing: '0.34em',
              textTransform: 'uppercase',
              color: GOLD,
              fontFamily: "'Inter', sans-serif",
              paddingLeft: '0.34em',
            }}
          >
            Supply &amp; Logistics
          </span>
        </div>

        {/* Headline — light over bold, poster style */}
        <h1
          id="welcome-title"
          className="w-fade-up-lg"
          style={{
            margin: 0,
            fontFamily: "'Inter', sans-serif",
            letterSpacing: '-0.02em',
            color: CREAM,
            textShadow: '0 2px 40px rgba(0,0,0,0.45)',
            animationDuration: '0.85s',
            animationDelay: '0.24s',
          }}
        >
          <span
            style={{
              display: 'block',
              fontWeight: 400,
              fontSize: 'clamp(2.1rem, 8.4vw, 6.4rem)',
              lineHeight: 1,
              letterSpacing: '0.02em',
            }}
          >
            Your project.
          </span>
          <span
            style={{
              display: 'block',
              fontWeight: 700,
              fontSize: 'clamp(1.8rem, 8vw, 6.2rem)',
              lineHeight: 0.98,
              letterSpacing: '0.01em',
            }}
          >
            Our procurement.
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="w-fade-up"
          style={{
            margin: '24px 0 0',
            maxWidth: '500px',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 400,
            fontSize: '18px',
            lineHeight: 1.5,
            color: 'rgba(245,239,230,0.85)',
            textShadow: '0 1px 20px rgba(0,0,0,0.45)',
            animationDuration: '0.8s',
            animationDelay: '0.42s',
          }}
        >
          Building materials sourced, checked and delivered by one accountable
          partner, from order to site.
        </p>

        {/* Ellipse CTA — borderRadius 50% makes a true ellipse, per the template */}
        <Link
          to="/"
          className="w-cta w-fade-up"
          style={{
            marginTop: '38px',
            padding: '18px clamp(34px, 8vw, 58px)',
            borderRadius: '50%',
            border: '1px solid rgba(245,239,230,0.6)',
            color: CREAM,
            textDecoration: 'none',
            fontSize: '12px',
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            fontFamily: "'Inter', sans-serif",
            backgroundColor: 'rgba(245,239,230,0)',
            animationDuration: '0.8s',
            animationDelay: '0.58s',
          }}
        >
          Open AdensaOps
        </Link>
      </div>

      {/* ---- Footer bar ---- */}
      <div
        className="w-fade-in w-footer"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 40px 26px',
          animationDuration: '0.8s',
          animationDelay: '0.8s',
        }}
      >
        <div style={label} className="w-footer-legal">
          Reg. No. CS208781026 · TIN C0068016212
        </div>

        <div
          className="w-footer-center"
          style={{ ...label, position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '5px' }}
        >
          <span style={{ color: 'rgba(245,239,230,0.92)', fontWeight: 600 }}>Your project.</span>
          <span>Our procurement.</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={label} className="w-footer-scope">
            Procurement · Supply · Logistics
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ opacity: 0.7 }}
            aria-hidden="true"
            focusable="false"
          >
            <path d="M5 15V9M10 19V5M15 16V8M20 13v-2" stroke={CREAM} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </section>
  )
}
