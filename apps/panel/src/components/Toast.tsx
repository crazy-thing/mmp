import { useEffect, useState } from 'react';

type ToastKind = 'error' | 'success';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

let nextId = 1;
const listeners = new Set<(item: ToastItem) => void>();

/** Shows a short message in the bottom-right corner. Errors stay a little longer. */
export function notify(message: string, kind: ToastKind = 'error'): void {
  const item = { id: nextId++, kind, message };
  for (const listener of listeners) listener(item);
}

export default function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const add = (item: ToastItem) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== item.id)), item.kind === 'error' ? 6000 : 2500);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute bottom-[24px] right-[41px] z-[200] flex w-[440px] flex-col items-end gap-[10px]">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto rounded-[15px] border-2 bg-mm-bg px-[18px] py-[12px] text-[18px] leading-[1.25] shadow-[0_0_30px_rgba(0,0,0,0.6)] ${
            item.kind === 'error' ? 'border-[#a33] text-[#ffb4b4]' : 'border-mm-accent text-white'
          }`}
          onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
