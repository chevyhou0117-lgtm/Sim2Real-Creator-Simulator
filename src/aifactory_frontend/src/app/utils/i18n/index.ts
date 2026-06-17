import zhCN from "../../locales/zh-CN.json";
import en from "../../locales/en.json";
import { useState, useEffect, useCallback } from "react";

// 支持的语言类型
export type Language = "zh-CN" | "en";

// 翻译数据类型
export type TranslationData = typeof zhCN;

// 翻译键路径类型
export type TranslationKey = keyof TranslationData | string;

// 语言包映射
const locales: Record<Language, TranslationData> = {
  "zh-CN": zhCN,
  en: en,
};

// 存储当前语言
let currentLang: Language = "zh-CN";

// 存储监听函数
let listeners: Set<() => void> = new Set();

// 获取当前语言
export const getCurrentLang = (): Language => currentLang;

// 设置当前语言
export const setCurrentLang = (lang: Language): void => {
  if (currentLang !== lang) {
    currentLang = lang;
    // 保存到 localStorage
    localStorage.setItem("language", lang);
    // 通知所有监听器
    listeners.forEach((listener) => listener());
  }
};

// 添加语言变化监听器
export const addLangChangeListener = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// 简单的路径解析函数
const getNestedValue = (obj: Record<string, any>, path: string): string => {
  // 防御：key 为 undefined/null/非字符串时不再崩溃（如状态值未命中映射表传入 undefined）
  if (path == null || typeof path !== "string") return "";
  const keys = path.split(".");
  let result: any = obj;

  for (const key of keys) {
    if (result && typeof result === "object" && key in result) {
      result = result[key];
    } else {
      return path; // 返回原始路径作为默认值
    }
  }

  return typeof result === "string" ? result : path;
};

// 翻译函数，支持参数替换
export const t = (
  key: TranslationKey,
  params?: Record<string, string | number>,
): string => {
  const currentLocale = locales[currentLang];
  let text = getNestedValue(currentLocale, key as string);

  // 如果有参数，进行替换
  if (params) {
    Object.keys(params).forEach((paramKey) => {
      text = text.replace(
        new RegExp(`\\{${paramKey}\\}`, "g"),
        String(params![paramKey]),
      );
    });
  }

  return text;
};

// 批量翻译
export const translate = (keys: TranslationKey[]): Record<string, string> => {
  const result: Record<string, string> = {};
  keys.forEach((key) => {
    result[key as string] = t(key);
  });
  return result;
};

// 初始化语言（从 localStorage 读取或使用浏览器默认语言）
export const initLang = (): void => {
  const savedLang = localStorage.getItem("language") as Language;
  const browserLang =
    navigator.language.split("-")[0] === "zh" ? "zh-CN" : "en";

  if (savedLang && savedLang in locales) {
    currentLang = savedLang;
  } else {
    currentLang = browserLang;
    localStorage.setItem("language", browserLang);
  }
};

// 切换语言（简化版）
export const toggleLang = (): void => {
  setCurrentLang(currentLang === "zh-CN" ? "en" : "zh-CN");
};

// 获取所有支持的语言列表
export const getSupportedLanguages = (): Language[] => {
  return Object.keys(locales) as Language[];
};

// 检查语言是否支持
export const isLanguageSupported = (lang: string): lang is Language => {
  return lang in locales;
};

/**
 * 根据当前语言，从对象中获取本地化字段值。
 * 当语言为英文时，优先返回 `*_en` 字段（后端通过 Accept-Language 头注入的翻译值）；
 * 若 `*_en` 字段不存在或为空，则回退到原始字段。
 *
 * @param obj    数据对象
 * @param field  原始字段名（如 "name"）
 * @param enField 英文翻译字段名（如 "name_en"），默认自动拼接为 `${field}_en`
 * @returns 本地化后的字段值
 */
export const getLocalizedField = <T extends Record<string, any>>(
  obj: T | null | undefined,
  field: string,
  enField?: string,
): string | undefined => {
  if (!obj) return undefined;
  const enKey = enField ?? `${field}_en`;
  if (currentLang === "en" && enKey in obj && obj[enKey]) {
    return obj[enKey];
  }
  return obj[field];
};

/**
 * React Hook：返回一个 getLocalizedField 函数，该函数在语言切换时自动触发组件重渲染。
 * 用法：const L = useLocalized(); 然后 JSX 中写 {L(node, 'name')}
 */
export const useLocalized = () => {
  const [, setTick] = useState(0);
  useEffect(() => {
    return addLangChangeListener(() => setTick((t) => t + 1));
  }, []);
  return useCallback(
    <T extends Record<string, any>>(
      obj: T | null | undefined,
      field: string,
      enField?: string,
    ): string | undefined => {
      return getLocalizedField(obj, field, enField);
    },
    [],
  );
};

// 默认导出
export default {
  t,
  translate,
  getCurrentLang,
  setCurrentLang,
  initLang,
  toggleLang,
  addLangChangeListener,
  getSupportedLanguages,
  isLanguageSupported,
  getLocalizedField,
  useLocalized,
};
