import React, { useState, useEffect } from 'react'
import ofpptLogo from '../assets/ofppt_logo_round.png'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { usersService } from '../services/firebaseService'

interface LoginPageProps {
  onLoginSuccess: () => void
}

// Predefined fallback credentials
const VALID_USERS = [
  { email: 'directeur@ista.ma', password: 'ofppt2026', role: 'Directeur' },
  { email: 'admin', password: 'admin123', role: 'Directeur' },
  { email: 'adil', password: 'adil2026', role: 'Directeur' }
]

export default function LoginPage({ onLoginSuccess }: LoginPageProps): React.ReactElement {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)

  // Dynamic application name synced with settings
  const [appName, setAppName] = useState<string>(() => {
    return localStorage.getItem('app_name') || 'Gestion des Emplois du Temps'
  })

  useEffect(() => {
    const handleNameChange = (): void => {
      setAppName(localStorage.getItem('app_name') || 'Gestion des Emplois du Temps')
    }
    window.addEventListener('app_name_changed', handleNameChange)
    return () => window.removeEventListener('app_name_changed', handleNameChange)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const emailNorm = email.trim().toLowerCase()

    try {
      // 1. First check in Firebase Firestore /users
      const firestoreUser = await usersService.getByIdentifier(emailNorm)
      if (firestoreUser && firestoreUser.password === password) {
        localStorage.setItem('isLoggedIn', 'true')
        localStorage.setItem('user_id', firestoreUser.id || '')
        localStorage.setItem('user_fullName', firestoreUser.nom || firestoreUser.nom_complet || 'dircteur')
        localStorage.setItem('user_matricule', firestoreUser.matricule || 'admin')
        localStorage.setItem('user_email', firestoreUser.email || '')
        localStorage.setItem('user_role', firestoreUser.role || 'Directeur')
        localStorage.setItem('user_password', firestoreUser.password || '')
        onLoginSuccess()
        return
      }
    } catch (err) {
      console.warn('Firebase login check failed, falling back to local storage:', err)
    }

    // 2. Check custom saved credentials from localStorage (Settings)
    const savedPass = localStorage.getItem('user_password') || 'admin123'
    const savedEmail = (localStorage.getItem('user_email') || 'adillamkadem@gmail.com').toLowerCase()
    const savedMatricule = (localStorage.getItem('user_matricule') || 'admin').toLowerCase()
    const savedRole = localStorage.getItem('user_role') || 'Directeur'

    const customMatch =
      (emailNorm === savedEmail || emailNorm === savedMatricule) && password === savedPass

    // 3. Check default valid users list
    const defaultMatch = VALID_USERS.find(
      u => u.email === emailNorm && u.password === password
    )

    if (customMatch || defaultMatch) {
      const role = customMatch ? savedRole : defaultMatch!.role
      const userMail = customMatch ? savedEmail : defaultMatch!.email
      localStorage.setItem('isLoggedIn', 'true')
      localStorage.setItem('userRole', role)
      localStorage.setItem('userEmail', userMail)
      onLoginSuccess()
    } else {
      setError('Email / Matricule ou mot de passe incorrect.')
      setLoading(false)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #e8eef6 0%, #d6e4f0 40%, #c8d8eb 70%, #dde9f4 100%)',
        fontFamily: 'Inter, Cairo, sans-serif',
        animation: 'loginFadeIn 0.4s ease-out'
      }}
    >
      {/* Blobs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: '10%', left: '8%', width: 280, height: 280,
          borderRadius: '50%', background: 'rgba(37,99,235,0.05)'
        }} />
        <div style={{
          position: 'absolute', bottom: '15%', right: '10%', width: 200, height: 200,
          borderRadius: '50%', background: 'rgba(6,182,212,0.06)'
        }} />
      </div>

      {/* Login Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          padding: '40px 44px 36px',
          width: '100%', maxWidth: 420,
          boxShadow: '0 16px 60px rgba(0,0,0,0.12), 0 4px 20px rgba(37,99,235,0.08)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
          animation: shake ? 'loginShake 0.4s ease' : 'loginCardIn 0.5s cubic-bezier(0.34,1.4,0.64,1)',
          position: 'relative', zIndex: 1
        }}
      >
        {/* Logo */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: '#f8fafc',
          border: '2px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20, overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)'
        }}>
          <img src={ofpptLogo} alt="OFPPT" style={{ width: 66, height: 66, objectFit: 'contain' }} />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 22, fontWeight: 800, color: '#0f172a',
          margin: '0 0 6px', letterSpacing: -0.3, textAlign: 'center',
          lineHeight: 1.3
        }}>
          {appName}
        </h1>
        <p style={{
          fontSize: 13, color: '#64748b', margin: '0 0 24px', textAlign: 'center'
        }}>
          ISTA Tertiaire My Rachid — OFPPT
        </p>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Email field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
              Email ou Matricule
            </label>
            <input
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.com ou matricule"
              required
              autoFocus
              style={{
                padding: '11px 14px',
                border: `1.5px solid ${error ? '#ef4444' : '#e2e8f0'}`,
                borderRadius: 10, fontSize: 14, outline: 'none',
                background: '#f8fafc', color: '#0f172a',
                transition: 'border-color 0.2s',
                width: '100%', boxSizing: 'border-box'
              }}
              onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.background = '#fff' }}
              onBlur={e => { e.target.style.borderColor = error ? '#ef4444' : '#e2e8f0'; e.target.style.background = '#f8fafc' }}
            />
          </div>

          {/* Password field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
              Mot de passe
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  padding: '11px 42px 11px 14px',
                  border: `1.5px solid ${error ? '#ef4444' : '#e2e8f0'}`,
                  borderRadius: 10, fontSize: 14, outline: 'none',
                  background: '#f8fafc', color: '#0f172a',
                  transition: 'border-color 0.2s',
                  width: '100%', boxSizing: 'border-box'
                }}
                onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.background = '#fff' }}
                onBlur={e => { e.target.style.borderColor = error ? '#ef4444' : '#e2e8f0'; e.target.style.background = '#f8fafc' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#94a3b8', display: 'flex', alignItems: 'center', padding: 2
                }}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '8px 12px',
              fontSize: 12.5, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 7
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: '13px 20px',
              background: loading ? '#93c5fd' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 0.2s, transform 0.1s',
              boxShadow: loading ? 'none' : '0 4px 14px rgba(37,99,235,0.35)'
            }}
            onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#1d4ed8' }}
            onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#2563eb' }}
            onMouseDown={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)' }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  animation: 'loginSpin 0.7s linear infinite', display: 'inline-block'
                }} />
                Connexion...
              </>
            ) : (
              <>
                <LogIn size={17} />
                Se Connecter
              </>
            )}
          </button>
        </form>

      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute', bottom: 28, textAlign: 'center',
        fontSize: 12, color: '#6b7280', fontFamily: 'Inter, sans-serif'
      }}>
        © 2026 ISTA Tertiaire My Rachid — Développé par{' '}
        <span style={{ color: '#2563eb', fontWeight: 600 }}>Adil Lamkadem</span>
      </div>

      <style>{`
        @keyframes loginFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes loginCardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes loginShake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-8px); }
          40%       { transform: translateX(8px); }
          60%       { transform: translateX(-6px); }
          80%       { transform: translateX(6px); }
        }
        @keyframes loginSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
