import React, { useEffect, useRef, useState } from 'react';

export const AnimatedBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -1000, y: -1000 });
  const [isMobile, setIsMobile] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Detect mobile touch environment
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Respect prefers-reduced-motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(motionQuery.matches);
    const onMotionChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', onMotionChange);
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMobile && !reducedMotion) {
        mouseRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('mousemove', handleMouseMove);
      if (motionQuery.removeEventListener) {
        motionQuery.removeEventListener('change', onMotionChange);
      }
    };
  }, [isMobile, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Particle nodes configuration
    const particleCount = isMobile ? 12 : 36;
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      opacity: number;
      pulseSpeed: number;
    }> = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        radius: Math.random() * 1.5 + 1,
        opacity: Math.random() * 0.5 + 0.15,
        pulseSpeed: Math.random() * 0.02 + 0.005
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        p1.x += p1.vx;
        p1.y += p1.vy;

        // Bounce on boundaries
        if (p1.x < 0 || p1.x > canvas.width) p1.vx *= -1;
        if (p1.y < 0 || p1.y > canvas.height) p1.vy *= -1;

        // Pulse opacity slightly
        p1.opacity += Math.sin(Date.now() * p1.pulseSpeed) * 0.002;
        p1.opacity = Math.max(0.1, Math.min(0.6, p1.opacity));

        // Draw particle point
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 48, 48, ${p1.opacity})`;
        ctx.shadowBlur = p1.radius * 3;
        ctx.shadowColor = '#ff3030';
        ctx.fill();
        ctx.shadowBlur = 0;

        // Mouse interaction: draw connection line to cursor when close
        const mPos = mouseRef.current;
        if (mPos.x > 0 && !isMobile) {
          const mdx = p1.x - mPos.x;
          const mdy = p1.y - mPos.y;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);

          if (mdist < 140) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(mPos.x, mPos.y);
            const lineOpacity = (1 - mdist / 140) * 0.25;
            ctx.strokeStyle = `rgba(255, 48, 48, ${lineOpacity})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // Connect nearby particles with thin crimson lines
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            const lineOpacity = (1 - dist / 120) * 0.14;
            ctx.strokeStyle = `rgba(255, 48, 48, ${lineOpacity})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }

      if (!reducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isMobile, reducedMotion]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#050505]">
      {/* Radial red atmosphere glow centered behind hero */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[550px] pointer-events-none opacity-40 blur-[130px]"
        style={{
          background: 'radial-gradient(circle, rgba(255, 48, 48, 0.20) 0%, rgba(122, 13, 18, 0.06) 55%, transparent 80%)'
        }}
      />

      {/* Grid Dot Matrix */}
      <div 
        className="absolute inset-0 bg-grid-dots opacity-45"
        style={{
          maskImage: 'radial-gradient(circle at center, black 50%, transparent 90%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black 50%, transparent 90%)'
        }}
      />

      {/* Canvas Particle Network */}
      <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full ${isMobile ? 'opacity-35' : 'opacity-55'}`} />

      {/* Radar Sweep Line Overlay */}
      {!reducedMotion && <div className="absolute inset-x-0 h-32 radar-sweep" />}

      {/* Horizontal Scanlines */}
      <div className="absolute inset-0 scanline opacity-20" />
    </div>
  );
};
