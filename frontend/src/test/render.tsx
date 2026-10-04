// Minimal render helper for component tests until B4 brings @testing-library/react.
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Rendered {
  container: HTMLElement;
  unmount: () => void;
}

/** Renders `ui` into a detached container and lets pending effects and promises settle. */
export async function render(ui: ReactNode): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  await settle();
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Flushes resolved promises and the React updates they cause. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Texts of every button in `container`, trimmed. */
export function buttonTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
}
