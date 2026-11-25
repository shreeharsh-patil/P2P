import React from 'react';

export const HowItWorks: React.FC = () => {
  const steps = [
    {
      num: '01',
      title: 'Create',
      desc: 'Generate a temporary session code.'
    },
    {
      num: '02',
      title: 'Connect',
      desc: 'Scan the QR code or enter the session code on the other device.'
    },
    {
      num: '03',
      title: 'Transfer',
      desc: 'Send files and text directly through WebRTC.'
    }
  ];

  return (
    <div className="max-w-4xl mx-auto w-full px-4 pt-4 space-y-4">
      <div className="font-mono text-xs text-[#8a8a8a] tracking-widest uppercase">
        How it works
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
        {steps.map((step, idx) => (
          <div
            key={step.num}
            className="tech-panel p-5 space-y-2 relative border border-[#1c1c22] bg-[#09090b] hover:border-[#ff2b2b]/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[#ff2b2b]">
                {step.num}
              </span>
              <span className="font-mono text-xs text-[#f2f2f2] font-semibold tracking-wider">
                {step.title}
              </span>
            </div>

            <p className="text-xs text-[#8a8a8a] leading-relaxed">
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
