/**
 * 防抖工具函数
 * 用于避免频繁触发状态重新计算
 */

import React from 'react';

/**
 * 防抖函数
 * @param func 要执行的函数
 * @param wait 等待时间（毫秒）
 * @param immediate 是否立即执行（true: 首次调用立即执行，后续防抖；false: 全部防抖）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function(this: any, ...args: Parameters<T>) {
    const context = this;

    const later = () => {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };

    const callNow = immediate && !timeout;

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);

    if (callNow) func.apply(context, args);
  };
}

/**
 * React Hook版本的防抖回调
 * 注意：需要在组件内部使用
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps: React.DependencyList = []
): T {
  // 使用useCallback和debounce包装回调
  // 注意：这需要React环境
  return React.useCallback(debounce(callback, delay), deps);
}