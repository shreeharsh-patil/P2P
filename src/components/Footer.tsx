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

        <div className="text-[11px] font-mono text-[#4a4a4a] tracking-wider">
          Made by{' '}
          <a
            href="https://github.com/shreeharsh-patil"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#8a8a8a] hover:text-[#f2f2f2] transition-colors underline-offset-2 hover:underline"
          >
            Shreeharsh
          </a>
        </div>

        <div className="pt-1">
          <a
            href="https://github.com/shreeharsh-patil/P2P"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[11px] font-mono text-[#4a4a4a] tracking-wider hover:text-[#f2f2f2] transition-colors"
            aria-label="View P2P on GitHub"
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
};
