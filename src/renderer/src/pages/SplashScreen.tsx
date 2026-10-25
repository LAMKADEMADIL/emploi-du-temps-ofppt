import React, { useEffect, useState } from 'react'
import ofpptLogo from '../assets/ofppt_logo_round.png'

interface SplashScreenProps {
  onFinish: () => void
}

export default function SplashScreen({ onFinish }: SplashScreenProps): React.ReactElement {
  const [visible, setVisible] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    // After 2.5s, start fade out (0.5s), then call onFinish
    const fadeTimer = setTimeout(() => {
      setFadeOut(true)
    }, 2500)

    const finishTimer = setTimeout(() => {
      setVisible(false)
      onFinish()
    }, 3000)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(finishTimer)
    }
  }, [onFinish])

  if (!visible) return <></>

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #e8eef6 0%, #d6e4f0 40%, #c8d8eb 70%, #dde9f4 100%)',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.5s ease-in-out',
        userSelect: 'none'
      }}
    >
      {/* Animated background blobs */}
      <div style={{
        position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none'
      }}>
        <div style={{
          position: 'absolute', top: '15%', left: '10%', width: 300, height: 300,
          borderRadius: '50%', background: 'rgba(37,99,235,0.06)',
          animation: 'splashBlob1 4s ease-in-out infinite'
        }} />
        <div style={{
          position: 'absolute', bottom: '20%', right: '12%', width: 220, height: 220,
          borderRadius: '50%', background: 'rgba(6,182,212,0.07)',
          animation: 'splashBlob2 5s ease-in-out infinite'
        }} />
        <div style={{
          position: 'absolute', top: '55%', left: '60%', width: 180, height: 180,
          borderRadius: '50%', background: 'rgba(16,185,129,0.05)',
          animation: 'splashBlob1 6s ease-in-out infinite reverse'
        }} />
      </div>

      {/* Center content */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
        animation: 'splashFadeIn 0.8s ease-out forwards'
      }}>
        {/* Logo circle with pulse ring */}
        <div style={{ position: 'relative', marginBottom: 28 }}>
          {/* Outer pulse ring */}
          <div style={{
            position: 'absolute', inset: -12,
            borderRadius: '50%',
            border: '2px solid rgba(37, 99, 235, 0.2)',
            animation: 'splashPulse 2s ease-in-out infinite'
          }} />
          {/* Logo container */}
          <div style={{
            width: 120, height: 120, borderRadius: '50%',
            background: '#ffffff',
            boxShadow: '0 8px 40px rgba(0,0,0,0.12), 0 2px 12px rgba(37,99,235,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            animation: 'splashLogoIn 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards'
          }}>
            <img
              src={ofpptLogo}
              alt="OFPPT"
              style={{ width: 100, height: 100, objectFit: 'contain' }}
            />
          </div>
        </div>

        {/* App name */}
        <div style={{
          fontSize: 22, fontWeight: 800, color: '#1e3a5f',
          letterSpacing: 0.5, textAlign: 'center',
          fontFamily: 'Inter, Cairo, sans-serif',
          marginBottom: 6,
          animation: 'splashTextIn 0.8s ease-out 0.3s both'
        }}>
          {localStorage.getItem('app_name') || 'Gestion des Emplois du Temps'}
        </div>
        <div style={{
          fontSize: 13.5, fontWeight: 500, color: '#4a7ab5',
          letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
          animation: 'splashTextIn 0.8s ease-out 0.4s both'
        }}>
          ISTA Tertiaire My Rachid — OFPPT
        </div>

        {/* Loading bar */}
        <div style={{
          marginTop: 36, width: 180, height: 3, borderRadius: 99,
          background: 'rgba(37,99,235,0.12)', overflow: 'hidden',
          animation: 'splashTextIn 0.8s ease-out 0.5s both'
        }}>
          <div style={{
            height: '100%', borderRadius: 99,
            background: 'linear-gradient(90deg, #2563eb, #06b6d4)',
            animation: 'splashLoadBar 2.5s ease-in-out forwards'
          }} />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute', bottom: 36, textAlign: 'center',
        animation: 'splashTextIn 0.8s ease-out 0.6s both'
      }}>
        <div style={{
          fontSize: 13, color: '#4a6080', fontFamily: 'Inter, sans-serif', marginBottom: 5
        }}>
          © 2026 ISTA Tertiaire My Rachid
        </div>
        <div style={{ fontSize: 12.5, color: '#5a7090', fontFamily: 'Inter, sans-serif' }}>
          Développé par{' '}
          <span style={{ color: '#2563eb', fontWeight: 700 }}>Adil Lamkadem</span>
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes splashFadeIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes splashLogoIn {
          from { opacity: 0; transform: scale(0.5) rotate(-10deg); }
          to   { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes splashTextIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashPulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50%       { transform: scale(1.12); opacity: 0.15; }
        }
        @keyframes splashLoadBar {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes splashBlob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%       { transform: translate(20px, -20px) scale(1.08); }
        }
        @keyframes splashBlob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%       { transform: translate(-15px, 18px) scale(1.05); }
        }
      `}</style>
    </div>
  )
}
