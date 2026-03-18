import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Suppress console output produced by test scripts that call console.log/warn
// as a side effect of the runtime-validation pass in analyze.ts.
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Radix UI's ScrollArea uses ResizeObserver which jsdom does not implement
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
