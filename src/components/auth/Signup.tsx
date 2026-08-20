import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CloudLightning, Mail, Lock, User } from 'lucide-react';

interface SignUpProps {
  onSwitchToLogin: () => void;
}

export const SignUp: React.FC<SignUpProps> = ({ onSwitchToLogin }) => {
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    const { error } = await signUp(email, password, fullName);

    setLoading(false);

    if (error) {
      setError(error);
      return;
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[#1e293b] border border-slate-800 rounded-2xl p-8 shadow-xl text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-3 bg-blue-500/10 rounded-full">
              <Mail className="w-8 h-8 text-blue-400" />
            </div>
          </div>

          <h2 className="text-white text-xl font-bold">
            Check your email
          </h2>

          <p className="text-slate-400 text-sm">
            We've sent a confirmation link to your email address.
          </p>

          <button
            onClick={onSwitchToLogin}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1e293b] border border-slate-800 rounded-2xl p-8 shadow-xl">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="p-3 bg-blue-500/10 rounded-xl">
              <CloudLightning className="w-8 h-8 text-blue-400" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white">
            Create Account
          </h1>

          <p className="text-slate-400 text-sm mt-1">
            Get started with your account
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Full Name
            </label>

            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />

              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                required
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg py-3 pl-10 pr-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Email
            </label>

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg py-3 pl-10 pr-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Password
            </label>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg py-3 pl-10 pr-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400 mt-6">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};
