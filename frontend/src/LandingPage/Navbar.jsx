import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  IoChevronDown, 
  IoArrowForward,
  IoLogOutOutline,
  IoSpeedometerOutline,
  IoBusinessOutline
} from 'react-icons/io5';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reactive User Profile Synchronization (7-day JWT Session)
  useEffect(() => {
    const syncUser = () => {
      const stored = localStorage.getItem('crm_user');
      const token = localStorage.getItem('crm_token');
      if (stored && token) {
        try {
          setCurrentUser(JSON.parse(stored));
        } catch (e) {
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
    };

    syncUser();
    window.addEventListener('auth-change', syncUser);
    window.addEventListener('storage', syncUser);
    return () => {
      window.removeEventListener('auth-change', syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    setCurrentUser(null);
    setProfileDropdownOpen(false);
    window.dispatchEvent(new Event('auth-change'));
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 pointer-events-none">
      
      {/* Transparent Navigation Bar */}
      <div 
        className={`w-full transition-all duration-200 py-4 ${
          isScrolled ? 'bg-slate-950/40 backdrop-blur-md' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between pointer-events-auto">
            
            {/* Brand Logo & Production Identity Badge */}
            <a href="#" className="flex items-center gap-3 group py-1">
              <div className="relative">
                <img 
                  src="/logo.png" 
                  alt="Zest Eat WhatsApp CRM" 
                  className="h-10 sm:h-12 w-auto object-contain drop-shadow-[0_0_12px_rgba(16,185,129,0.4)] transition-transform duration-200 group-hover:scale-105" 
                />
              </div>
            </a>

            {/* Right Desktop Actions: User Profile Dropdown or Login/Signup */}
            <div className="flex items-center gap-3">
              {currentUser ? (
                <div className="relative" ref={profileDropdownRef}>
                  
                  {/* Clickable Profile Button with Color Theme Gradient Ring */}
                  <button
                    type="button"
                    onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                    className="flex items-center gap-2.5 p-1.5 pr-3.5 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-emerald-500/40 shadow-lg shadow-emerald-500/10 backdrop-blur-md transition-all cursor-pointer group"
                    aria-expanded={profileDropdownOpen}
                  >
                    {/* Glowing Profile Avatar Circle */}
                    <div className="relative w-8 h-8 rounded-full p-[2px] bg-gradient-to-tr from-amber-400 via-emerald-400 to-teal-400 shadow-md group-hover:scale-105 transition-transform">
                      <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center text-xs font-black text-white">
                        {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-950" />
                    </div>

                    <div className="text-left">
                      <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors leading-tight">
                        {currentUser.name}
                      </div>
                      <div className="text-[10px] text-slate-300 font-mono truncate max-w-[110px]">
                        {currentUser.company_name || 'Zest Eat'}
                      </div>
                    </div>

                    <IoChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform duration-200 ${profileDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Profile Dropdown Menu */}
                  {profileDropdownOpen && (
                    <div className="absolute right-0 mt-3 w-80 rounded-2xl bg-slate-900/98 backdrop-blur-2xl border border-emerald-500/30 shadow-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150 z-50">
                      
                      {/* User Identity Header */}
                      <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                        <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-tr from-amber-400 via-emerald-400 to-teal-400 shadow-md shrink-0">
                          <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center text-sm font-black text-white">
                            {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                        </div>
                        <div className="overflow-hidden">
                          <div className="text-sm font-black text-white truncate">{currentUser.name}</div>
                          <div className="text-xs text-slate-300 truncate font-mono">{currentUser.email}</div>
                          <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                            <IoBusinessOutline className="w-3 h-3" />
                            <span className="truncate max-w-[140px]">{currentUser.company_name || 'Zest Eat'}</span>
                          </div>
                        </div>
                      </div>

                      {/* PRIMARY ACTION: REDIRECT TO DASHBOARD */}
                      <Link
                        to="/dashboard"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 hover:from-amber-600 hover:to-emerald-600 text-white font-black text-xs flex items-center justify-between shadow-lg shadow-amber-500/20 border border-white/20 transition-all cursor-pointer group"
                      >
                        <span className="flex items-center gap-2">
                          <IoSpeedometerOutline className="text-lg text-white" />
                          <span>Open CRM Studio</span>
                        </span>
                        <IoArrowForward className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </Link>

                      {/* Sign Out Button */}
                      <div className="pt-2 border-t border-white/10">
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="w-full py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold text-xs flex items-center justify-center gap-2 border border-rose-500/20 transition-colors cursor-pointer"
                        >
                          <IoLogOutOutline className="text-base" />
                          <span>Sign Out from Workspace</span>
                        </button>
                      </div>

                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-200 hover:text-white hover:bg-white/10 transition-colors duration-150"
                  >
                    Sign In
                  </Link>

                  <Link
                    to="/signup"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 hover:from-amber-600 hover:to-emerald-600 shadow-lg shadow-amber-500/20 border border-white/20 transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <span>🚀 Get Started Free</span>
                    <IoArrowForward className="text-sm" />
                  </Link>
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </header>
  );
}
