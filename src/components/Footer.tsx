import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-[#1c1c22] bg-[#050505] py-8 mt-12 text-center">
      <div className="max-w-4xl mx-auto px-4 space-y-3">
        <div className="text-sm font-mono font-bold tracking-widest text-[#f2f2f2] uppercase">
          SHREE
        </div>

        <div className="text-[11px] font-mono text-[#4a4a4a] tracking-wider">
          Peer-to-peer file & text transfer
        </div>
      </div>
    </footer>
  );
};
