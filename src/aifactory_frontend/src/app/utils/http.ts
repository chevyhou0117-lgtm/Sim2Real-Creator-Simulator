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

import axios, { AxiosRequestConfig } from "axios";
import { getCurrentLang } from "./i18n";

export interface ApiResponse<T> {
  code: number;
  message?: string;
  data: T;
}

type BusinessResponse = {
  code?: unknown;
  message?: unknown;
};

function isBinaryPayload(payload: unknown): boolean {
  return (
    (typeof Blob !== "undefined" && payload instanceof Blob) ||
    payload instanceof ArrayBuffer
  );
}

/**
 * The backend may return HTTP 200 while reporting a failed business operation
 * in its common response envelope. Convert that response into a rejected
 * promise so callers cannot accidentally continue down their success path.
 */
function assertBusinessSuccess<T>(payload: T): T {
  if (
    payload === null ||
    typeof payload !== "object" ||
    isBinaryPayload(payload)
  ) {
    return payload;
  }

  const businessResponse = payload as BusinessResponse;
  if (
    typeof businessResponse.code === "number" &&
    businessResponse.code !== 200
  ) {
    const message =
      typeof businessResponse.message === "string" &&
      businessResponse.message.trim()
        ? businessResponse.message
        : `Request failed with business code ${businessResponse.code}`;
    const error = new Error(message) as Error & { code?: number; data?: T };
    error.code = businessResponse.code;
    error.data = payload;
    throw error;
  }

  return payload;
}

// 创建 axios 实例，配置更合理的参数
const axiosInstance = axios.create({
  timeout: 600000, // 增加超时时间到 600 秒，适应大文件上传
  maxContentLength: Infinity, // 允许无限大的响应内容
  maxBodyLength: Infinity, // 允许无限大的请求体
});

// 请求拦截器：自动注入 Accept-Language 头，后端据此返回 *_en 字段
axiosInstance.interceptors.request.use((config) => {
  const lang = getCurrentLang();
  const acceptLang = lang === "en" ? "en" : "zh-CN";
  config.headers["Accept-Language"] = acceptLang;
  return config;
});

// HTTP 4xx/5xx 的统一响应也保留后端业务消息，供页面直接展示。
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data;
      if (
        responseData &&
        typeof responseData === "object" &&
        !isBinaryPayload(responseData)
      ) {
        const message = (responseData as BusinessResponse).message;
        if (typeof message === "string" && message.trim()) {
          error.message = message;
        }
      }
    }
    return Promise.reject(error);
  },
);

export class Http {
  static async get<T>(
    url: string,
    config: AxiosRequestConfig = {},
  ): Promise<ApiResponse<T>> {
    const response = await axiosInstance.get(url, config);
    return assertBusinessSuccess(response.data ?? {}) as ApiResponse<T>;
  }

  static async post<T, R>(
    url: string,
    payload: T,
    config: AxiosRequestConfig<T> = {},
  ): Promise<ApiResponse<R>> {
    const requestConfig: AxiosRequestConfig<T> = {
      ...config,
      headers: {
        ...(payload instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...config.headers,
      },
    };

    const response = await axiosInstance.post(url, payload, requestConfig);
    return assertBusinessSuccess(response.data ?? {}) as ApiResponse<R>;
  }

  static async put<T, R>(
    url: string,
    payload: T,
    config: AxiosRequestConfig<T> = {},
  ): Promise<ApiResponse<R>> {
    const response = await axiosInstance.put(url, payload, {
      ...config,
      headers: {
        ...(payload instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...config.headers,
      },
    });
    return assertBusinessSuccess(response.data ?? {}) as ApiResponse<R>;
  }

  static async del<T, R = unknown>(
    url: string,
    payload: T,
    config: AxiosRequestConfig<T> = {},
  ): Promise<ApiResponse<R>> {
    const response = await axiosInstance.delete(url, {
      ...config,
      data: payload,
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
      },
    });
    return assertBusinessSuccess(response.data ?? {}) as ApiResponse<R>;
  }
}
