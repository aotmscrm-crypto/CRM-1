import React, { useRef, useState, useEffect } from 'react';
import { 
  Users, 
  Target, 
  BookUser,
  Briefcase, 
  MessageSquare, 
  Send,
  CheckSquare, 
  CreditCard, 
  Settings,
  Plug,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { IoLogoInstagram as Instagram } from 'react-icons/io5';

export const navTabs = [
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'todos', label: 'Todo List', icon: CheckSquare },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'whatsapp', label: 'Whatsapp Message', icon: MessageSquare },
  { id: 'contacts', label: 'Contacts', icon: BookUser },
  { id: 'whatsapp-blast', label: 'Whatsapp Blast', icon: Send },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function MiniNavbar({ activeTab, setActiveTab, currentUser }) {
  const role = currentUser?.role?.toLowerCase() || 'admin';
  const scrollRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const visibleTabs = navTabs.filter((tab) => {
    if (role === 'admin') return true;
    if (role === 'manager') {
      return ['contacts', 'whatsapp-blast', 'whatsapp', 'todos'].includes(tab.id);
    }
    if (role === 'employee') {
      return ['whatsapp-blast', 'whatsapp', 'contacts', 'todos'].includes(tab.id);
    }
    return true;
  });

  const checkScrollState = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftArrow(scrollLeft > 5);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 5);
  };

  useEffect(() => {
    checkScrollState();
    window.addEventListener('resize', checkScrollState);
    return () => window.removeEventListener('resize', checkScrollState);
  }, []);

  const handleScroll = (direction) => {
    if (!scrollRef.current) return;
    const scrollAmount = direction === 'left' ? -220 : 220;
    scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    setTimeout(checkScrollState, 300);
  };

  return (
    <div className="relative border-b border-slate-200/80 pt-2 group">
      
      {/* Left Scroll Arrow Button */}
      {showLeftArrow && (
        <button
          type="button"
          onClick={() => handleScroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/90 shadow-md border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-900 hover:text-white transition-all cursor-pointer backdrop-blur-xs"
          title="Scroll Left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {/* Right Scroll Arrow Button */}
      {showRightArrow && (
        <button
          type="button"
          onClick={() => handleScroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/90 shadow-md border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-900 hover:text-white transition-all cursor-pointer backdrop-blur-xs"
          title="Scroll Right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Scroll Container with Smooth Behavior */}
      <div 
        ref={scrollRef}
        onScroll={checkScrollState}
        className="flex items-center gap-7 overflow-x-auto scroll-smooth scrollbar-none px-2 py-0.5"
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 pb-4 text-sm font-bold whitespace-nowrap transition-all duration-200 cursor-pointer relative shrink-0 ${
                isActive
                  ? 'text-sky-600 font-black scale-105'
                  : 'text-slate-600 hover:text-slate-900 hover:scale-102'
              }`}
            >
              <Icon className={`w-4.5 h-4.5 transition-transform ${isActive ? 'text-sky-600 scale-110' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500 rounded-full shadow-xs animate-in fade-in" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
