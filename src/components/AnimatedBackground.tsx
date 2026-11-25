import React from 'react';
import DarkVeil from './DarkVeil';

export const AnimatedBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#050505]">
      <DarkVeil color="#ef4444" opacity={0.85} />

      {/* Grid Dot Matrix */}
      <div
        className="absolute inset-0 bg-grid-dots opacity-35"
        style={{
          maskImage: 'radial-gradient(circle at center, black 50%, transparent 90%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black 50%, transparent 90%)'
        }}
      />

      {/* Horizontal Scanlines */}
      <div className="absolute inset-0 scanline opacity-15" />
    </div>
  );
};
