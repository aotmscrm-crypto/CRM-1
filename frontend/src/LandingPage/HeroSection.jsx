import React from 'react';
import RobotHero from '../Components/ui/robot-hero';
import { 
  IoFlashOutline, 
  IoPlayCircleOutline, 
  IoArrowForward, 
  IoShieldCheckmarkOutline,
  IoCheckmarkCircleOutline,
  IoPulseOutline
} from 'react-icons/io5';

export default function HeroSection() {
  return (
    <section className="relative w-full h-screen min-h-[750px] overflow-hidden bg-slate_dark">
      {/* 3D Robot Background */}
      <div className="absolute inset-0 w-full h-full">
        <RobotHero 
          backgroundText="CRM"
          showNavbar={false}
          color="#39a820ff"
          pantallaColor="#5ccd1bff"
          pantallaBrillo={2.0}
          metalness={0.8}
          scale={1.08}
        />
      </div>

      {/* Atmospheric Vignette & Bottom Contrast Gradient Overlay */}
      <div className="absolute inset-0 bg-slate_dark/20 backdrop-brightness-95 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-slate_dark via-slate_dark/70 to-transparent pointer-events-none" />

      {/* Hero Action Content Layer */}
      <div className="absolute inset-0 flex flex-col justify-end z-20 px-4 sm:px-6 lg:px-8 pointer-events-none pb-12">
        <div className="max-w-4xl mx-auto text-center space-y-6 w-full">
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 pointer-events-auto">
            {/* Primary Action Button */}
            <a
              href="#demo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-9 py-4 rounded-full font-bold text-sm tracking-wide text-white bg-red-600 hover:bg-red-700 shadow-2xl shadow-red-600/40 hover:shadow-red-600/60 hover:-translate-y-1 active:translate-y-0 border border-white/30 transition-all duration-200 group"
            >
              <IoFlashOutline className="text-lg group-hover:scale-110 transition-transform" />
              <span>Book a Demo</span>
              <IoArrowForward className="text-xs group-hover:translate-x-1 transition-transform" />
            </a>

            {/* Secondary Action Button */}
            <a
              href="#simulator"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-9 py-4 rounded-full font-bold text-sm tracking-wide text-white bg-slate_dark-300/80 hover:bg-slate_dark-300 backdrop-blur-xl border border-white/25 hover:border-white/50 shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-200"
            >
              <IoPlayCircleOutline className="text-xl text-red-500" />
              <span>Explore Platform</span>
            </a>
          </div>

          {/* Micro Trust Indicators */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-4 text-xs sm:text-sm text-slate-300 font-mono pointer-events-auto">
            <span className="flex items-center gap-1.5 bg-slate_dark/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10">
              <IoCheckmarkCircleOutline className="text-red-500 text-base" /> 3.8x Deal Velocity
            </span>
            <span className="flex items-center gap-1.5 bg-slate_dark/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10">
              <IoPulseOutline className="text-emerald-400 text-base" /> &lt; 45s Response SLA
            </span>
            <span className="flex items-center gap-1.5 bg-slate_dark/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10">
              <IoShieldCheckmarkOutline className="text-sky-400 text-base" /> Zero-Ban Account Protection
            </span>
          </div>

        </div>
      </div>
    </section>
  );
}
