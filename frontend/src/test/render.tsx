// Shared helpers for component tests, built on @testing-library/react.
// src/test/setup.ts unmounts everything after each test (testing-library `cleanup`).
import { act, render as rtlRender, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';

/** Renders `ui` and lets pending effects and resolved promises (mocked API calls) settle. */
export async function render(ui: ReactNode): Promise<RenderResult> {
  const result = rtlRender(ui);
  await settle();
  return result;
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
