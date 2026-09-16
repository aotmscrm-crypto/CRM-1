import React from 'react';
import Navbar from './Navbar';
import HeroSection from './HeroSection';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate_dark text-white font-sans overflow-hidden">
      {/* Navigation */}
      <Navbar />

      {/* Main Section */}
      <main>
        <HeroSection />
      </main>
    </div>
  );
}

export {
  Navbar,
  HeroSection,
};
