import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './zh.json';

/** 支持的语言。键名即英文原文，英文模式下 t() 直接回退到键。 */
export const LANGS = ['zh', 'en'] as const;
export type Lang = (typeof LANGS)[number];

const LANG_STORAGE_KEY = 'lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch { /* localStorage 不可用：用默认值 */ }
  return 'zh';  // 默认中文
}

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: {} },  // 英文模式：键本身就是英文，缺省回退到键
  },
  lng: initialLang(),
  fallbackLng: false,
  // 自然语言键：键名是完整英文文案，含 . : 等字符，必须关闭分隔符解析
  keySeparator: false,
  nsSeparator: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

/** 切换语言并持久化到 localStorage。 */
export function setLang(lang: Lang) {
  i18n.changeLanguage(lang);
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* ignore */ }
}

export default i18n;
