import React from 'react';
import { ArrowUpRight, Link2, Send } from 'lucide-react';
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
    <div className="workflow-grid">
      {steps.map((step, idx) => {
        const Icon = [ArrowUpRight, Link2, Send][idx];
        return (
          <Card key={step.num} className="workflow-card">
            <CardContent className="workflow-card-content">
              <div className="workflow-card-top"><span>{step.num}</span><Icon size={17} /></div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
