/*
 * SPDX-FileCopyrightText: Copyright (c) 2024 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: LicenseRef-NvidiaProprietary
 *
 * NVIDIA CORPORATION, its affiliates and licensors retain all intellectual
 * property and proprietary rights in and to this material, related
 * documentation and any modifications thereto. Any use, reproduction,
 * disclosure or distribution of this material and related documentation
 * without an express license agreement from NVIDIA CORPORATION or
 * its affiliates is strictly prohibited.
 */

import axios, { AxiosProgressEvent } from "axios";
import { getCurrentLang } from "./i18n";

// Define custom response types
// src/http.ts
// src/http.ts

// 创建 axios 实例，配置更合理的参数
const axiosInstance = axios.create({
  timeout: 600000, // 增加超时时间到 600 秒，适应大文件上传
  maxContentLength: Infinity, // 允许无限大的响应内容
  maxBodyLength: Infinity, // 允许无限大的请求体
  headers: {
    // "Cache-Control": "no-cache",
    // Pragma: "no-cache",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": "true",
    // "Content-Type": "application/json",
    // "Content-Length": 388,
    // Connection: "keep-alive", // 开启长连接，复用TCP通道
  },
});

// 请求拦截器：自动注入 Accept-Language 头，后端据此返回 *_en 字段
axiosInstance.interceptors.request.use((config) => {
  const lang = getCurrentLang();
  const acceptLang = lang === "en" ? "en" : "zh-CN";
  config.headers["Accept-Language"] = acceptLang;
  return config;
});

export class Http {
  static async get<T>(
    url: string,
    config?: any,
  ): Promise<{ code: number; data: T }> {
    const response = await axiosInstance.get(url, config);
    const data = response.data || {};
    return data;
  }

  static async post<T, R>(
    url: string,
    payload: T,
    onUploadProgress?: (progressEvent: AxiosProgressEvent) => void,
  ): Promise<{ code: number; data: R }> {
    const config: any = {};

    // 如果 payload 是 FormData，不设置 Content-Type，让浏览器自动设置
    if (!(payload instanceof FormData)) {
      config.headers = {
        "Content-Type": "application/json",
      };
    }

    // 添加进度监听
    if (onUploadProgress) {
      config.onUploadProgress = onUploadProgress;
    }

    const response = await axiosInstance.post(url, payload, config);
    const data = response.data || {};
    return data;
  }

  static async put<T, R>(
    url: string,
    payload: T,
  ): Promise<{ code: number; data: R }> {
    const response = await axiosInstance.put(url, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = response.data || {};
    return data;
  }

  static async del<T>(
    url: string,
    payload: T,
  ): Promise<{ code: number; message?: string; data?: any }> {
    const response = await axiosInstance.delete(url, {
      data: payload,
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = response.data || {};
    return data;
  }
}
