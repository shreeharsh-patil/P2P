import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent browser zoom and inspect/DevTools shortcuts
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

  window.addEventListener(
    'keydown',
    (e) => {
      const isZoomShortcut =
        (e.ctrlKey || e.metaKey) &&
        (['+', '=', '-', '_', '0'].includes(e.key) ||
          ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(e.code));

      const isInspectShortcut =
        e.key === 'F12' ||
        e.code === 'F12' ||
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          ['KeyI', 'KeyJ', 'KeyC', 'KeyK'].includes(e.code)) ||
        (e.metaKey && e.altKey && ['KeyI', 'KeyJ', 'KeyC', 'KeyU'].includes(e.code)) ||
        ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyU');

      if (isZoomShortcut || isInspectShortcut) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    { capture: true }
  );

  document.addEventListener('contextmenu', preventGesture);
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
