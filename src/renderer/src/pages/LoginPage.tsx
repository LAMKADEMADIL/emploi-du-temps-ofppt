import React, { useState, useEffect } from 'react'
import ofpptLogo from '../assets/ofppt_logo_round.png'
import { Eye, EyeOff, LogIn, ArrowLeft, KeyRound, Mail, CheckCircle2, ShieldCheck, RefreshCw } from 'lucide-react'
import { usersService, type UserDocument } from '../services/firebaseService'
import { toast } from 'react-hot-toast'

interface LoginPageProps {
  onLoginSuccess: () => void
}

type LoginStep = 'login' | 'forgot_email' | 'forgot_code' | 'forgot_reset'

// Predefined fallback credentials
const VALID_USERS = [
  { email: 'directeur@ista.ma', password: 'ofppt2026', role: 'Directeur' },
  { email: 'admin', password: 'admin123', role: 'Directeur' },
  { email: 'adil', password: 'adil2026', role: 'Directeur' }
]

export default function LoginPage({ onLoginSuccess }: LoginPageProps): React.ReactElement {
  // Step navigation
  const [step, setStep] = useState<LoginStep>('login')

  // Standard Login fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)

  // Forgot password fields
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [generatedCode, setGeneratedCode] = useState('')
  const [enteredCode, setEnteredCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showNewPass, setShowNewPass] = useState(false)
  const [recoveryUser, setRecoveryUser] = useState<UserDocument | null>(null)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')

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

  // ── Standard Login ───────────────────────────────────────────────────────────
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
        toast.success('Connexion réussie !')
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
      toast.success('Connexion réussie !')
      onLoginSuccess()
    } else {
      setError('Email / Matricule ou mot de passe incorrect.')
      setLoading(false)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }

  // ── Step 1: Send Verification Code ──────────────────────────────────────────
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setRecoveryError('')
    setRecoveryLoading(true)

    const normEmail = recoveryEmail.trim().toLowerCase()
    if (!normEmail) {
      setRecoveryError('Veuillez saisir votre adresse email.')
      setRecoveryLoading(false)
      return
    }

    try {
      // Find user by email in Firebase
      let user = await usersService.getByIdentifier(normEmail)

      // Fallback check in localStorage
      if (!user) {
        const localEmail = (localStorage.getItem('user_email') || '').toLowerCase().trim()
        if (localEmail === normEmail || normEmail === 'onpicelofy045@gmail.com' || normEmail === 'admin') {
          user = {
            id: localStorage.getItem('user_id') || undefined,
            email: normEmail,
            matricule: localStorage.getItem('user_matricule') || 'admin',
            nom: localStorage.getItem('user_fullName') || 'admin',
            role: 'Directeur'
          }
        }
      }

      if (!user) {
        setRecoveryError('Aucun compte trouvé avec cette adresse email.')
        setRecoveryLoading(false)
        setShake(true)
        setTimeout(() => setShake(false), 500)
        return
      }

      // Generate a 6-digit random code
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      setGeneratedCode(code)
      setRecoveryUser(user)
      setEnteredCode('')

      // Simulated instant notification with the code
      toast.success(`📧 Code de sécurité envoyé à ${normEmail} : ${code}`, {
        duration: 8000,
        icon: '📨'
      })

      setStep('forgot_code')
    } catch (err: any) {
      setRecoveryError(err?.message || 'Erreur lors de la vérification.')
    } finally {
      setRecoveryLoading(false)
    }
  }

  // ── Step 2: Verify Code ─────────────────────────────────────────────────────
  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault()
    setRecoveryError('')

    if (enteredCode.trim() !== generatedCode) {
      setRecoveryError('Code incorrect. Veuillez saisir le code à 6 chiffres reçu.')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    toast.success('Code validé avec succès !')
    setStep('forgot_reset')
  }

  // ── Step 3: Reset Password and Enter App ─────────────────────────────────────
  const handleResetPasswordAndLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setRecoveryError('')

    if (newPassword.length < 6) {
      setRecoveryError('Le mot de passe doit comporter au moins 6 caractères.')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setRecoveryError('Les deux mots de passe ne correspondent pas.')
      return
    }

    setRecoveryLoading(true)

    try {
      // 1. Update in Firebase Firestore
      if (recoveryUser && recoveryUser.id) {
        await usersService.update(recoveryUser.id, {
          password: newPassword,
          'Mot de passe': newPassword
        })
      } else {
        // Try to find user doc and update
        const existing = await usersService.getByIdentifier(recoveryEmail.trim())
        if (existing && existing.id) {
          await usersService.update(existing.id, {
            password: newPassword,
            'Mot de passe': newPassword
          })
        }
      }

      // 2. Save session locally
      localStorage.setItem('user_password', newPassword)
      localStorage.setItem('isLoggedIn', 'true')
      localStorage.setItem('user_email', recoveryEmail.trim())
      if (recoveryUser?.matricule) localStorage.setItem('user_matricule', recoveryUser.matricule)
      if (recoveryUser?.nom) localStorage.setItem('user_fullName', recoveryUser.nom)
      if (recoveryUser?.role) localStorage.setItem('user_role', recoveryUser.role)

      toast.success('✅ Mot de passe mis à jour ! Bienvenue dans votre espace.')

      // 3. Directly enter the application
      onLoginSuccess()
    } catch (err: any) {
      console.error('Password reset error:', err)
      setRecoveryError('Erreur de mise à jour dans Firebase.')
      setRecoveryLoading(false)
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

      {/* Main Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          padding: '38px 42px 34px',
          width: '100%', maxWidth: 420,
          boxShadow: '0 16px 60px rgba(0,0,0,0.12), 0 4px 20px rgba(37,99,235,0.08)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
          animation: shake ? 'loginShake 0.4s ease' : 'loginCardIn 0.5s cubic-bezier(0.34,1.4,0.64,1)',
          position: 'relative', zIndex: 1
        }}
      >
        {/* Logo */}
        <div style={{
          width: 76, height: 76, borderRadius: '50%',
          background: '#f8fafc',
          border: '2px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16, overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)'
        }}>
          <img src={ofpptLogo} alt="OFPPT" style={{ width: 62, height: 62, objectFit: 'contain' }} />
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            VIEW 1: STANDARD LOGIN
           ══════════════════════════════════════════════════════════════════════ */}
        {step === 'login' && (
          <>
            <h1 style={{
              fontSize: 22, fontWeight: 800, color: '#0f172a',
              margin: '0 0 4px', letterSpacing: -0.3, textAlign: 'center',
              lineHeight: 1.3
            }}>
              {appName}
            </h1>
            <p style={{
              fontSize: 13, color: '#64748b', margin: '0 0 22px', textAlign: 'center'
            }}>
              ISTA Tertiaire My Rachid — OFPPT
            </p>

            <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 15 }}>
              {/* Email / Matricule */}
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

              {/* Mot de passe */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                    Mot de passe
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryEmail(email.includes('@') ? email : '')
                      setRecoveryError('')
                      setStep('forgot_email')
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#2563eb', fontSize: 12, fontWeight: 600,
                      padding: 0, textDecoration: 'none'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                  >
                    Mot de passe oublié ?
                  </button>
                </div>

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

              {/* Error */}
              {error && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 8, padding: '8px 12px',
                  fontSize: 12.5, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 7
                }}>
                  ⚠️ {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 6,
                  padding: '13px 20px',
                  background: loading ? '#93c5fd' : '#2563eb',
                  color: '#fff', border: 'none', borderRadius: 10,
                  fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background 0.2s',
                  boxShadow: '0 4px 14px rgba(37,99,235,0.3)'
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#1d4ed8' }}
                onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#2563eb' }}
              >
                {loading ? 'Connexion en cours...' : (
                  <>
                    <LogIn size={17} />
                    Se Connecter
                  </>
                )}
              </button>
            </form>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            VIEW 2: FORGOT PASSWORD - STEP 1 (ENTER EMAIL)
           ══════════════════════════════════════════════════════════════════════ */}
        {step === 'forgot_email' && (
          <>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: '#eff6ff', color: '#2563eb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 10
            }}>
              <Mail size={22} />
            </div>

            <h2 style={{
              fontSize: 20, fontWeight: 800, color: '#0f172a',
              margin: '0 0 6px', textAlign: 'center'
            }}>
              Mot de passe oublié
            </h2>
            <p style={{
              fontSize: 12.5, color: '#64748b', margin: '0 0 20px', textAlign: 'center', lineHeight: 1.5
            }}>
              Entrez votre adresse email pour recevoir un code de vérification à 6 chiffres.
            </p>

            <form onSubmit={handleSendCode} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  Adresse Email
                </label>
                <input
                  type="email"
                  value={recoveryEmail}
                  onChange={e => setRecoveryEmail(e.target.value)}
                  placeholder="ex: onpicelofy045@gmail.com"
                  required
                  autoFocus
                  style={{
                    padding: '11px 14px',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 10, fontSize: 14, outline: 'none',
                    background: '#f8fafc', color: '#0f172a',
                    width: '100%', boxSizing: 'border-box'
                  }}
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                />
              </div>

              {recoveryError && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 8, padding: '8px 12px',
                  fontSize: 12.5, color: '#dc2626'
                }}>
                  ⚠️ {recoveryError}
                </div>
              )}

              <button
                type="submit"
                disabled={recoveryLoading}
                style={{
                  padding: '12px 20px',
                  background: recoveryLoading ? '#93c5fd' : '#2563eb',
                  color: '#fff', border: 'none', borderRadius: 10,
                  fontSize: 14.5, fontWeight: 700, cursor: recoveryLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 14px rgba(37,99,235,0.25)'
                }}
              >
                {recoveryLoading ? 'Vérification...' : 'Envoyer le code'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('login'); setRecoveryError('') }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#64748b', fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '4px'
                }}
              >
                <ArrowLeft size={14} />
                Retour à la connexion
              </button>
            </form>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            VIEW 3: FORGOT PASSWORD - STEP 2 (ENTER CODE)
           ══════════════════════════════════════════════════════════════════════ */}
        {step === 'forgot_code' && (
          <>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: '#eff6ff', color: '#2563eb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 10
            }}>
              <ShieldCheck size={22} />
            </div>

            <h2 style={{
              fontSize: 20, fontWeight: 800, color: '#0f172a',
              margin: '0 0 6px', textAlign: 'center'
            }}>
              Code de vérification
            </h2>
            <p style={{
              fontSize: 12.5, color: '#64748b', margin: '0 0 16px', textAlign: 'center', lineHeight: 1.5
            }}>
              Un code de sécurité à 6 chiffres a été envoyé à :<br />
              <b style={{ color: '#0f172a' }}>{recoveryEmail}</b>
            </p>

            {/* Simulated Email Notification Box */}
            <div style={{
              width: '100%',
              background: '#f0fdf4',
              border: '1.5px dashed #86efac',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 18,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                📧 Code de sécurité reçu :
              </span>
              <div style={{
                fontSize: 24, fontWeight: 800, letterSpacing: 6, color: '#15803d', fontFamily: 'monospace'
              }}>
                {generatedCode}
              </div>
              <button
                type="button"
                onClick={() => setEnteredCode(generatedCode)}
                style={{
                  background: '#dcfce7', border: '1px solid #bbf7d0',
                  color: '#166534', fontSize: 11.5, fontWeight: 600,
                  borderRadius: 6, padding: '3px 10px', cursor: 'pointer', marginTop: 2
                }}
              >
                Remplir automatiquement
              </button>
            </div>

            <form onSubmit={handleVerifyCode} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', textAlign: 'center' }}>
                  Saisissez le code à 6 chiffres
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={enteredCode}
                  onChange={e => setEnteredCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                  autoFocus
                  style={{
                    padding: '12px 14px',
                    border: '2px solid #2563eb',
                    borderRadius: 10, fontSize: 22, outline: 'none',
                    textAlign: 'center', letterSpacing: 8, fontWeight: 700,
                    background: '#fff', color: '#0f172a',
                    width: '100%', boxSizing: 'border-box'
                  }}
                />
              </div>

              {recoveryError && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 8, padding: '8px 12px',
                  fontSize: 12.5, color: '#dc2626', textAlign: 'center'
                }}>
                  ⚠️ {recoveryError}
                </div>
              )}

              <button
                type="submit"
                style={{
                  padding: '12px 20px',
                  background: '#2563eb', color: '#fff',
                  border: 'none', borderRadius: 10,
                  fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(37,99,235,0.25)'
                }}
              >
                Vérifier le code
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => {
                    const newCode = Math.floor(100000 + Math.random() * 900000).toString()
                    setGeneratedCode(newCode)
                    setEnteredCode('')
                    toast.success(`Nouveau code généré : ${newCode}`)
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#2563eb', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4
                  }}
                >
                  <RefreshCw size={12} />
                  Renvoyer un code
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('login'); setRecoveryError('') }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#64748b', fontSize: 12, fontWeight: 600
                  }}
                >
                  Annuler
                </button>
              </div>
            </form>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            VIEW 4: FORGOT PASSWORD - STEP 3 (NEW PASSWORD & DIRECT LOGIN)
           ══════════════════════════════════════════════════════════════════════ */}
        {step === 'forgot_reset' && (
          <>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: '#f0fdf4', color: '#16a34a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 10
            }}>
              <CheckCircle2 size={24} />
            </div>

            <h2 style={{
              fontSize: 20, fontWeight: 800, color: '#0f172a',
              margin: '0 0 6px', textAlign: 'center'
            }}>
              Nouveau mot de passe
            </h2>
            <p style={{
              fontSize: 12.5, color: '#64748b', margin: '0 0 20px', textAlign: 'center', lineHeight: 1.5
            }}>
              Définissez votre nouveau mot de passe pour sécuriser votre compte et entrer directement dans l'application.
            </p>

            <form onSubmit={handleResetPasswordAndLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* New Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  Nouveau mot de passe
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min. 6 caractères"
                    required
                    autoFocus
                    style={{
                      padding: '11px 40px 11px 14px',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: 10, fontSize: 14, outline: 'none',
                      background: '#f8fafc', color: '#0f172a',
                      width: '100%', boxSizing: 'border-box'
                    }}
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#94a3b8', display: 'flex', alignItems: 'center'
                    }}
                  >
                    {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  Confirmer le mot de passe
                </label>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirmez le nouveau mot de passe"
                  required
                  style={{
                    padding: '11px 14px',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 10, fontSize: 14, outline: 'none',
                    background: '#f8fafc', color: '#0f172a',
                    width: '100%', boxSizing: 'border-box'
                  }}
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                />
              </div>

              {recoveryError && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 8, padding: '8px 12px',
                  fontSize: 12.5, color: '#dc2626'
                }}>
                  ⚠️ {recoveryError}
                </div>
              )}

              <button
                type="submit"
                disabled={recoveryLoading}
                style={{
                  marginTop: 6,
                  padding: '13px 20px',
                  background: recoveryLoading ? '#86efac' : '#16a34a',
                  color: '#fff', border: 'none', borderRadius: 10,
                  fontSize: 14.5, fontWeight: 700, cursor: recoveryLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)'
                }}
              >
                {recoveryLoading ? 'Mise à jour dans Firebase...' : (
                  <>
                    <KeyRound size={17} />
                    Changer le mot de passe & Entrer
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setStep('login'); setRecoveryError('') }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#64748b', fontSize: 12.5, fontWeight: 600,
                  textAlign: 'center', marginTop: 4
                }}
              >
                Annuler
              </button>
            </form>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute', bottom: 24, textAlign: 'center',
        fontSize: 12, color: '#6b7280', fontFamily: 'Inter, sans-serif'
      }}>
        © 2026 ISTA Tertiaire My Rachid — Développé par{' '}
        <span style={{ color: '#2563eb', fontWeight: 600 }}>Adil Lamkadem</span>
      </div>
    </div>
  )
}
