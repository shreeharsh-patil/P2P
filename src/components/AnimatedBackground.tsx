import React from 'react';

/** CSS-only dusk lighting keeps the background atmospheric without a canvas loop. */
export const AnimatedBackground: React.FC = () => (
  <div className="dusk-atmosphere" aria-hidden="true">
    <span className="dusk-orb dusk-orb--pink" />
    <span className="dusk-orb dusk-orb--aqua" />
    <span className="dusk-horizon" />
    <span className="dusk-grain" />
  </div>
);
