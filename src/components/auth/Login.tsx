import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CloudLightning, Mail, Lock } from 'lucide-react';

interface LoginProps {
  onSwitchToSignUp: () => void;
  onSwitchToForgotPassword: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSwitchToSignUp, onSwitchToForgotPassword }) => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1e293b] border border-slate-800 rounded-2xl p-8 shadow-xl">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="bg-orange-500 p-2 rounded-lg">
            <CloudLightning className="h-5 w-5 text-slate-950 stroke-[2.5]" />
          </div>
          <h1 className="text-lg font-black text-white">
            Roof<span className="text-orange-500">Flow</span> AI
          </h1>
        </div>

        <h2 className="text-white text-sm font-bold text-center mb-6">Log in to your account</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5">
            <Mail className="h-4 w-4 text-slate-500 shrink-0" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="flex-1 bg-transparent text-sm text-slate-100 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5">
            <Lock className="h-4 w-4 text-slate-500 shrink-0" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="flex-1 bg-transparent text-sm text-slate-100 focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-slate-950 font-black text-sm py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>

        <div className="mt-4 flex flex-col items-center gap-2 text-xs">
          <button onClick={onSwitchToForgotPassword} className="text-slate-400 hover:text-white underline">
            Forgot password?
          </button>
          <p className="text-slate-500">
            Don't have an account?{' '}
            <button onClick={onSwitchToSignUp} className="text-orange-400 hover:text-orange-300 font-semibold">
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
