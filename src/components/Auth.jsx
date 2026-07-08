import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Auth() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.');
        setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(traduireErreur(err.message));
    } finally {
      setLoading(false);
    }
  };

  const traduireErreur = (msg) => {
    if (msg.includes('Invalid login credentials')) return 'Email ou mot de passe incorrect.';
    if (msg.includes('User already registered')) return 'Un compte existe déjà avec cet email.';
    if (msg.includes('Password should be at least')) return 'Le mot de passe doit contenir au moins 6 caractères.';
    return msg;
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h1 style={styles.title}>🍰 Atelier Manager</h1>
        <p style={styles.subtitle}>
          {mode === 'login' ? 'Connecte-toi à ton espace' : 'Crée ton compte'}
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Adresse email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={styles.input}
          />

          {error && <p style={styles.error}>{error}</p>}
          {message && <p style={styles.success}>{message}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Chargement...' : mode === 'login' ? 'Se connecter' : "S'inscrire"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError(null);
            setMessage(null);
          }}
          style={styles.switchButton}
        >
          {mode === 'login'
            ? "Pas encore de compte ? S'inscrire"
            : 'Déjà un compte ? Se connecter'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1A1F16',
    padding: '20px',
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    padding: '32px 28px',
    width: '100%',
    maxWidth: '380px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
  },
  title: {
    textAlign: 'center',
    fontSize: '24px',
    margin: '0 0 4px',
    color: '#1A1F16',
  },
  subtitle: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '14px',
    margin: '0 0 24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  input: {
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '15px',
    outline: 'none',
  },
  button: {
    marginTop: '8px',
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: '#E8B94A',
    color: '#1A1F16',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
  },
  switchButton: {
    marginTop: '18px',
    width: '100%',
    background: 'none',
    border: 'none',
    color: '#6b7280',
    fontSize: '13px',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  error: {
    color: '#dc2626',
    fontSize: '13px',
    margin: 0,
  },
  success: {
    color: '#16a34a',
    fontSize: '13px',
    margin: 0,
  },
};
