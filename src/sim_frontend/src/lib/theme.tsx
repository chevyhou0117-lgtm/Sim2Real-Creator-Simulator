// 深色 / 浅色主题。选择持久化在 localStorage，应用方式 = 给 <html> 加 class（dark|light）。
// 实际配色见 src/index.css 的 :root（深色默认）与 html.light（浅色覆盖）。
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'theme';

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch { /* localStorage 不可用 */ }
  return null;
}

function initialTheme(): Theme {
  // 默认深色（保留原有观感）；用户切换后记忆。
  return readStored() ?? 'dark';
}

export function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.remove('dark', 'light');
  el.classList.add(theme);
  el.style.colorScheme = theme;
}

// 模块加载即应用一次，避免 React 渲染前的首屏闪烁（与 i18n 初始化同理）。
applyTheme(initialTheme());

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
  };

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme must be used within ThemeProvider');
  return c;
}
