import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from './ui/card';

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
    <section className="w-full space-y-4">
      <div className="text-center">
        <p className="inline-block bg-[#080809]/80 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#929297]">// How it works</p>
        <h2 className="mt-2 text-base font-semibold tracking-tight text-[#f2f2f2]">Three steps. Direct connection.</h2>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map((step, idx) => (
          <Card
            key={step.num}
            className="group relative overflow-hidden border-white/[0.08] bg-[#0a0a0c]/80 transition-colors hover:border-[#ff3a40]/40 hover:bg-[#0d0d10]"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-[#ff3a40]/25 bg-[#ff2b2b]/[0.07] px-2 font-mono text-[10px] font-semibold text-[#ff777c]">{step.num}</span>
                <ArrowUpRight className="h-4 w-4 text-[#55555b] transition-colors group-hover:text-[#ff686e]" />
              </div>
              <h3 className="mt-5 text-sm font-semibold text-[#f2f2f2]">{step.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#929297]">{step.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};
