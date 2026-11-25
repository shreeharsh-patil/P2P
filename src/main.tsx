import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent browser zoom via Ctrl/Cmd+wheel, trackpad pinch, keyboard shortcuts, and multi-touch gestures
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const preventGesture = (e: Event) => e.preventDefault();
  const preventPinchTouch = (e: TouchEvent) => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  };

  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  window.addEventListener('keydown', (e) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      (['+', '=', '-', '_', '0'].includes(e.key) ||
        ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(e.code))
    ) {
      e.preventDefault();
    }
  });

  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });
  document.addEventListener('touchstart', preventPinchTouch, { passive: false });
  document.addEventListener('touchmove', preventPinchTouch, { passive: false });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
