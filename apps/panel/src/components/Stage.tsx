import { useEffect, useState, type ReactNode } from 'react';

const WIDTH = 1920;
const HEIGHT = 1080;

const fit = () => Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);

/**
 * The Figma frames are 1920×1080. Like the launcher, the panel draws on that canvas and scales it
 * to the window, so every measurement matches the design.
 */
export default function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(fit);

  useEffect(() => {
    const onResize = () => setScale(fit());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const left = Math.max(0, (window.innerWidth - WIDTH * scale) / 2);
  const top = Math.max(0, (window.innerHeight - HEIGHT * scale) / 2);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-mm-bg">
      <div
        className="absolute bg-mm-bg text-white"
        style={{ width: WIDTH, height: HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left', left, top }}
      >
        {children}
      </div>
    </div>
  );
}
