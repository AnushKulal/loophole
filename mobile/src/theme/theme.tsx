import { createContext, useContext, type ReactNode } from 'react';
import { THEMES, type ThemeName, type Tokens } from './tokens';

const ThemeCtx = createContext<Tokens>(THEMES.dark);

export function ThemeProvider({ name, children }: { name: ThemeName; children: ReactNode }) {
  return <ThemeCtx.Provider value={THEMES[name]}>{children}</ThemeCtx.Provider>;
}

/** The active palette. Every component reads colour from here, never a literal. */
export const useTheme = () => useContext(ThemeCtx);

export { THEMES, type ThemeName, type Tokens };
