import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LogIn,
  UserPlus,
  Mail,
  Lock,
  User,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';

/**
 * Role assigned to self-serve sign-ups.
 *
 * The registration form no longer asks for a role, so the account owner is
 * provisioned as `admin` (the previous default of the removed select). Flip this
 * to 'employee' if new accounts should start with the chat/tasks panel instead.
 */
const SIGNUP_ROLE = 'admin';

/**
 * Reads an auth response without ever throwing a raw parse error.
 *
 * A sleeping host (Render cold start) or a wrong VITE_API_BASE_URL can answer
 * with an empty 502/503 body, and `response.json()` then fails with the opaque
 * "Unexpected end of JSON input" instead of telling the user what happened.
 */
const parseAuthResponse = async (response) => {
  const raw = await response.text();

  if (!raw) {
    return {
      success: false,
      message: response.status >= 500
        ? `The API is not responding (HTTP ${response.status}). It may still be starting up — wait a few seconds and try again.`
        : `The API returned an empty response (HTTP ${response.status}). Check VITE_API_BASE_URL.`,
    };
  }

  try {
    return JSON.parse(raw);
  } catch {
    // A proxy error page or a wrong base URL answers with HTML, not JSON.
    return {
      success: false,
      message: /^\s*</.test(raw)
        ? `The API returned a web page instead of JSON (HTTP ${response.status}). Check VITE_API_BASE_URL.`
        : `The API returned an unreadable response (HTTP ${response.status}).`,
    };
  }
};

export default function AuthPage({ defaultMode = 'signin' }) {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') || defaultMode;
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup');
  const [showPassword, setShowPassword] = useState(false);
  const [serverMessage, setServerMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const passwordValue = watch('password');

  const onSubmit = async (formData) => {
    setLoading(true);
    setServerMessage(null);

    // Dynamic endpoint (Local Node.js Express vs Cloud)
    const API_BASE = import.meta.env.VITE_API_BASE_URL || ((typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
      ? 'http://localhost:5000'
      : 'https://crm-1-62pl.onrender.com');

    try {
      if (isSignUp) {
        if (formData.password !== formData.confirmPassword) {
          throw new Error("Passwords do not match. Please re-enter.");
        }

        const response = await fetch(`${API_BASE}/api/auth/sign-up`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.fullName,
            email: formData.email,
            password: formData.password,
            role: SIGNUP_ROLE
          })
        });

        const result = await parseAuthResponse(response);
        if (!response.ok || result.success === false) {
          throw new Error(result.message || result.detail || 'Registration failed');
        }

        if (result.token) {
          localStorage.setItem('crm_token', result.token);
          localStorage.setItem('crm_user', JSON.stringify(result.user));
          window.dispatchEvent(new Event('auth-change'));
        }

        const userRole = result.user?.role?.toLowerCase() || SIGNUP_ROLE;
        setServerMessage({
          type: 'success',
          text: `Account created successfully! Redirecting to ${userRole.toUpperCase()} Panel...`
        });
        setTimeout(() => navigate(`/dashboard?panel=${userRole}`), 1200);
      } else {
        const response = await fetch(`${API_BASE}/api/auth/sign-in`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password
          })
        });

        const result = await parseAuthResponse(response);
        if (!response.ok || result.success === false) {
          throw new Error(result.message || result.detail || 'Invalid email or password');
        }

        if (result.token) {
          localStorage.setItem('crm_token', result.token);
          localStorage.setItem('crm_user', JSON.stringify(result.user));
          window.dispatchEvent(new Event('auth-change'));
        }

        const userRole = result.user?.role?.toLowerCase() || 'employee';
        setServerMessage({
          type: 'success',
          text: `Signed in successfully! Welcome to ${userRole.toUpperCase()} Panel, ${result.user?.name || ''}!`
        });
        setTimeout(() => navigate(`/dashboard?panel=${userRole}`), 1200);
      }
    } catch (err) {
      setServerMessage({
        type: 'error',
        text: err.message || 'Authentication error. Please check your credentials.'
      });
    } finally {
      setLoading(false);
    }
  };

  // Shared input styling for the ivory card.
  const fieldClass =
    'w-full pl-9 pr-3 py-2 rounded-lg bg-[#FCFAF4] border border-[#E8DEC9] text-xs text-slate-900 placeholder-slate-400 ' +
    'focus:outline-none focus:border-tech_blue focus:ring-2 focus:ring-tech_blue/15 transition-all';
  const labelClass = 'block text-[11px] font-semibold text-slate-700 mb-1';
  const iconClass = 'absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400';
  const errorClass = 'text-[10.5px] font-medium text-rose-600 mt-1';

  return (
    <div className="min-h-screen w-full bg-[#FBF7EE] text-slate-900 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Ivory background texture */}
      <div className="absolute inset-0 nova-grid-bg opacity-25 pointer-events-none -z-10" />
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-tech_orange/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-tech_blue/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Back to Home */}
      <div className="w-full max-w-md mb-5">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-tech_orange transition-colors group cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Back to Landing Page</span>
        </Link>
      </div>

      {/* Authentication Card */}
      <div className="w-full max-w-md bg-gradient-to-b from-white to-[#FFFDF8] border border-[#EADFC8] rounded-3xl p-5 sm:p-7 shadow-xl shadow-[#E4D8BE]/40">

        {/* Brand Header */}
        <div className="text-center space-y-1.5 mb-5">
          <Link to="/" className="inline-block mb-1">
            <img
              src="/logo.png"
              alt="Academy of Tech Masters"
              className="h-10 sm:h-12 mx-auto w-auto object-contain hover:scale-105 transition-transform"
            />
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {isSignUp ? 'Create your account' : 'Sign in with email'}
          </h1>
          <p className="text-xs text-slate-500">
            {isSignUp
              ? 'Start your WhatsApp Automation CRM workspace in less than a minute.'
              : 'Sign in to access your company dashboard and live chat inbox.'}
          </p>
        </div>

        {/* Tab Switcher: Sign In vs Sign Up */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F5EEE0] border border-[#EDE3CF] mb-5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setIsSignUp(false); setServerMessage(null); }}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg transition-all cursor-pointer ${
              !isSignUp
                ? 'bg-white text-slate-900 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In</span>
          </button>

          <button
            type="button"
            onClick={() => { setIsSignUp(true); setServerMessage(null); }}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg transition-all cursor-pointer ${
              isSignUp
                ? 'bg-white text-slate-900 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Register</span>
          </button>
        </div>

        {/* Status Notification */}
        {serverMessage && (
          <div className={`mb-4 p-3 rounded-lg border text-[11px] font-medium flex items-start gap-2 ${
            serverMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
            {serverMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            )}
            <span>{serverMessage.text}</span>
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">

          {isSignUp && (
            <div>
              <label className={labelClass}>
                Full Name <span className="text-tech_orange">*</span>
              </label>
              <div className="relative">
                <User className={iconClass} />
                <input
                  type="text"
                  autoComplete="name"
                  maxLength={50}
                  placeholder="e.g. Vikram Sharma"
                  {...register('fullName', {
                    required: 'Full Name is required',
                    minLength: { value: 3, message: 'Must be at least 3 characters' },
                    maxLength: { value: 50, message: 'Maximum 50 characters allowed' },
                    pattern: {
                      value: /^[a-zA-Z\s]{3,50}$/,
                      message: 'Only letters and spaces allowed (no numbers)'
                    }
                  })}
                  className={fieldClass}
                />
              </div>
              {errors.fullName && <p className={errorClass}>{errors.fullName.message}</p>}
            </div>
          )}

          <div>
            <label className={labelClass}>
              Email <span className="text-tech_orange">*</span>
            </label>
            <div className="relative">
              <Mail className={iconClass} />
              <input
                type="email"
                autoComplete="email"
                maxLength={80}
                placeholder="you@company.com"
                {...register('email', {
                  required: 'Email address is required',
                  maxLength: { value: 80, message: 'Email cannot exceed 80 characters' },
                  pattern: {
                    value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i,
                    message: 'Enter a valid email address (e.g. name@company.com)'
                  }
                })}
                className={fieldClass}
              />
            </div>
            {errors.email && <p className={errorClass}>{errors.email.message}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`${labelClass} mb-0`}>
                Password <span className="text-tech_orange">*</span>
              </label>
              {!isSignUp && (
                <a href="#forgot" className="text-[10.5px] font-medium text-tech_blue hover:underline">
                  Forgot password?
                </a>
              )}
            </div>
            <div className="relative">
              <Lock className={iconClass} />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                maxLength={64}
                placeholder="••••••••••••"
                {...register('password', isSignUp ? {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'Password must be at least 8 characters' },
                  maxLength: { value: 64, message: 'Password cannot exceed 64 characters' },
                  pattern: {
                    value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^~_\-+=])[A-Za-z\d@$!%*?&#^~_\-+=]{8,}$/,
                    message: 'Include uppercase, lowercase, number, and special character'
                  }
                } : {
                  required: 'Password is required',
                  minLength: { value: 6, message: 'Password must be at least 6 characters' },
                  maxLength: { value: 64, message: 'Password cannot exceed 64 characters' }
                })}
                className={`${fieldClass} pr-9`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className={errorClass}>{errors.password.message}</p>}
            {isSignUp && !errors.password && (
              <p className="text-[10.5px] text-slate-400 mt-1">
                8+ characters with uppercase, lowercase, a number and a symbol.
              </p>
            )}
          </div>

          {isSignUp && (
            <div>
              <label className={labelClass}>
                Confirm Password <span className="text-tech_orange">*</span>
              </label>
              <div className="relative">
                <Lock className={iconClass} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  maxLength={64}
                  placeholder="••••••••••••"
                  {...register('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: (val) => val === passwordValue || 'Passwords do not match'
                  })}
                  className={fieldClass}
                />
              </div>
              {errors.confirmPassword && <p className={errorClass}>{errors.confirmPassword.message}</p>}
            </div>
          )}

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-tech_orange to-tech_orange-600 hover:brightness-105 shadow-lg shadow-tech_orange/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
          >
            {loading ? (
              <span className="animate-pulse">Authenticating...</span>
            ) : isSignUp ? (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Create Account</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        {/* Bottom Toggle Note */}
        <div className="mt-5 text-center text-xs text-slate-600 pt-3 border-t border-[#EDE3CF]">
          {isSignUp ? (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setIsSignUp(false); setServerMessage(null); }}
                className="text-tech_orange font-bold hover:underline cursor-pointer"
              >
                Sign in here
              </button>
            </p>
          ) : (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => { setIsSignUp(true); setServerMessage(null); }}
                className="text-tech_blue font-bold hover:underline cursor-pointer"
              >
                Create one free
              </button>
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
