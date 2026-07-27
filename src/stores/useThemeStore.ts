import { create } from 'zustand';

// Keep a stable light-mode value for components that select light-specific
// icons, editor skins, and chart options. The app no longer exposes a theme
// preference or follows the operating-system color scheme.
type ThemeState = {
  resolvedTheme: 'light' | 'dark';
};

export const useThemeStore = create<ThemeState>()(() => ({
  resolvedTheme: 'light',
}));
