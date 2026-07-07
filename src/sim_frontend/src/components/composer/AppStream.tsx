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
//
// 移植自 aifactory_frontend/src/app/components/composer/AppStream.tsx，使 sim_frontend 也能
// 用 @nvidia/omniverse-webrtc-streaming-library 直连 Kit 串流（替代原 5183 iframe 页）。
// 与原文件的差异：① 去掉 prop-types 依赖（sim 未安装 prop-types）；② stream.config.json 相对路径。
// 配置见根目录 stream.config.json（source=local → 连 local.server:mediaPort/signalingPort）。
//
import React, { Component } from "react";
// 仅 AppStreamer / StreamType 是运行时导出（值）；其余是 TS 类型，必须用 import type，
// 否则 Vite 8 的 rolldown 打包器会报 MISSING_EXPORT（比 aifactory 的 Vite 6 更严格）。
import { AppStreamer, StreamType } from "@nvidia/omniverse-webrtc-streaming-library";
import type {
  StreamEvent,
  StreamProps,
  DirectConfig,
  GFNConfig,
} from "@nvidia/omniverse-webrtc-streaming-library";
import StreamConfig from "../../../stream.config.json";
import { kitHost } from "../../lib/runtimeConfig";

interface AppStreamProps {
  sessionId: string;
  backendUrl: string;
  signalingserver: string;
  signalingport: number;
  mediaserver: string;
  mediaport: number;
  accessToken: string;
  style?: React.CSSProperties;
  onStarted: () => void;
  onStreamFailed: () => void;
  onLoggedIn: (userId: string) => void;
  handleCustomEvent: (event: any) => void;
  onFocus: () => void;
  onBlur: () => void;
}

interface AppStreamState {
  streamReady: boolean;
  activeButton: string | null;
}

export default class AppStream extends Component<
  AppStreamProps,
  AppStreamState
> {
  private _requested: boolean;
  private _fitObserver: ResizeObserver | null = null;
  private _fitTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastSent = { width: 0, height: 0 };

  static defaultProps = {
    style: {},
  };

  constructor(props: AppStreamProps) {
    super(props);

    this._requested = false;
    this.state = {
      streamReady: false,
      activeButton: null,
    };
  }

  // 贴合方案（对齐 NVIDIA web-viewer-sample 官方模式，不用 fitStreamResolution）：
  // Kit 渲染尺寸 = <video> 元素物理像素（CSS × devicePixelRatio），等比压进
  // config 上限（streamWidth/Height，当前 3840×2160）后取 16 倍数。三个要点：
  // ① 16 倍数是 NVENC H.264 硬约束，非 16 倍数的动态 resize 会失败并静默回落；
  // ② 库把 connect 时传入的 width/height 当作后续 resize 的【硬上限】，超过直接报错
  //    "greater than the maximum width/height" → connect 必须传上限值，而非元素初始尺寸
  //    （否则天花板被钉死在首次布局，之后全屏/换档位都升不上去）；
  // ③ macOS HiDPI 各档位 DPR 恒为 2，「看起来像 2K」时 CSS×DPR=5120×2880 超过
  //    4K 面板真实像素（系统超采后缩屏输出）——超出部分纯浪费，等比压回上限即可。
  private _streamDims(): { width: number; height: number } {
    const MAX_W = StreamConfig.local.streamWidth;
    const MAX_H = StreamConfig.local.streamHeight;
    const el = document.getElementById("remote-video");
    const r = el?.getBoundingClientRect();
    const w0 = r?.width ?? 0;
    const h0 = r?.height ?? 0;
    if (w0 <= 0 || h0 <= 0) {
      return { width: MAX_W, height: MAX_H };
    }
    const dpr = window.devicePixelRatio || 1;
    let w = w0 * dpr;
    let h = h0 * dpr;
    const s = Math.min(1, MAX_W / w, MAX_H / h);
    w *= s;
    h *= s;
    const round16 = (n: number) => Math.max(256, Math.floor(n / 16) * 16);
    return { width: round16(w), height: round16(h) };
  }

  // 盯 <video> 元素尺寸（覆盖全屏/收侧栏/拖窗口等一切布局变化），防抖后按新比例
  // 重新计算并手动 AppStreamer.resize（尺寸没变则跳过）。
  private _watchFitResolution() {
    const el = document.getElementById("remote-video");
    if (!el || typeof ResizeObserver === "undefined") return;
    this._fitObserver = new ResizeObserver(() => {
      if (this._fitTimer != null) clearTimeout(this._fitTimer);
      this._fitTimer = setTimeout(() => {
        const { width, height } = this._streamDims();
        if (width === this._lastSent.width && height === this._lastSent.height) return;
        this._lastSent = { width, height };
        AppStreamer.resize(width, height).catch((err: unknown) =>
          console.warn("[AppStream] resize failed", err),
        );
      }, 300);
    });
    this._fitObserver.observe(el);
  }

  componentWillUnmount() {
    this._fitObserver?.disconnect();
    this._fitObserver = null;
    if (this._fitTimer != null) clearTimeout(this._fitTimer);
  }

  componentDidMount() {
    if (!this._requested) {
      this._requested = true;

      let streamProps: StreamProps;
      let streamConfig: DirectConfig | GFNConfig;
      let streamSource: StreamType.DIRECT | StreamType.GFN;

      if (StreamConfig.source === "gfn") {
        streamSource = StreamType.GFN;
        streamConfig = {
          //@ts-ignore
          GFN: GFN,
          catalogClientId: StreamConfig.gfn.catalogClientId,
          clientId: StreamConfig.gfn.clientId,
          cmsId: StreamConfig.gfn.cmsId,
          onUpdate: (message: StreamEvent) => this._onUpdate(message),
          onStart: (message: StreamEvent) => this._onStart(message),
          onCustomEvent: (message: any) => this._onCustomEvent(message),
        };
      } else if (StreamConfig.source === "local") {
        streamSource = StreamType.DIRECT;
        // 连接尺寸 = config 上限（3840×2160）：库把它当后续 resize 的硬上限（见 _streamDims 注②）。
        // streamReady 后 ResizeObserver 首触发会立刻按元素实际物理像素 resize 下来（≤ 上限恒合法）。
        this._lastSent = {
          width: StreamConfig.local.streamWidth,
          height: StreamConfig.local.streamHeight,
        };
        streamConfig = {
          videoElementId: "remote-video",
          audioElementId: "remote-audio",
          // 本机直连不做鉴权：authenticate:true 时库要求必须带 accessToken（本地无 token）→
          // 否则报 "Invalid prop accessToken: must be provided if the authenticate prop is true."
          authenticate: false,
          maxReconnects: 20,
          signalingServer: kitHost(StreamConfig.local.server),
          signalingPort: StreamConfig.local.signalingPort,
          mediaServer: kitHost(StreamConfig.local.server),
          ...(StreamConfig.local.mediaPort != null && {
            mediaPort: StreamConfig.local.mediaPort,
          }),
          // cursor:"free" 让串流库完整接管指针（含鼠标右键拖动=Kit 内建转视角/fly 导航）；
          // 不设时直连模式可能只转发部分鼠标事件，右键导航失效。
          cursor: "free",
          nativeTouchEvents: true,
          // 初始分辨率 = 上限（同时被库记为 resize 硬上限）；就绪后 ResizeObserver 立即贴合。
          // 不用 fitStreamResolution：它开着时 AppStreamer.resize() 会抛错，且其内部
          // resize 请求不做 16 倍数对齐，Kit 动态 resize 失败 → 退回锁定比例。
          width: this._lastSent.width,
          height: this._lastSent.height,
          fps: 60,
          onUpdate: (message: StreamEvent) => this._onUpdate(message),
          onStart: (message: StreamEvent) => this._onStart(message),
          onCustomEvent: (message: any) => this._onCustomEvent(message),
          onStop: (message: StreamEvent) => {
            console.log("local stop", message);
          },
          onTerminate: (message: StreamEvent) => {
            console.log("local terminate", message);
          },
        };
      } else if (StreamConfig.source === "stream") {
        streamSource = StreamType.DIRECT;
        streamConfig = {
          signalingServer: this.props.signalingserver,
          signalingPort: this.props.signalingport,
          mediaServer: this.props.mediaserver,
          mediaPort: this.props.mediaport,
          backendUrl: this.props.backendUrl,
          sessionId: this.props.sessionId,
          autoLaunch: true,
          cursor: "free",
          mic: false,
          videoElementId: "remote-video",
          audioElementId: "remote-audio",
          authenticate: false,
          maxReconnects: 20,
          nativeTouchEvents: true,
          width: 1920,
          height: 1080,
          fps: 60,
          onUpdate: (message: StreamEvent) => this._onUpdate(message),
          onStart: (message: StreamEvent) => this._onStart(message),
          onCustomEvent: (message: any) => this._onCustomEvent(message),
          onStop: (message: StreamEvent) => {
            console.log("stream stop", message);
          },
          onTerminate: (message: StreamEvent) => {
            console.log("stream terminate", message);
          },
        };
      } else {
        console.error(`Unknown stream source: ${StreamConfig.source}`);
        return;
      }

      try {
        streamProps = { streamConfig, streamSource };
        AppStreamer.connect(streamProps)
          .then((result: StreamEvent) => {
            console.info(result);
          })
          .catch((error: StreamEvent) => {
            console.error(error);
          });
      } catch (error) {
        console.error(error);
      }
    }
  }

  componentDidUpdate(
    _prevProps: AppStreamProps,
    prevState: AppStreamState,
    _snapshot: any,
  ) {
    if (prevState.streamReady === false && this.state.streamReady === true) {
      const player =
        (document.getElementById(
          "gfn-stream-player-video",
        ) as HTMLVideoElement) ||
        (document.getElementById("remote-video") as HTMLVideoElement);
      if (player) {
        player.tabIndex = -1;
        player.playsInline = true;
        player.muted = true;
        player.play();
      }
      // 流就绪后开始盯 video 元素尺寸，全屏/布局变化时重新贴合流分辨率
      if (StreamConfig.source === "local") {
        this._watchFitResolution();
      }
    }
  }

  static sendMessage(message: any) {
    AppStreamer.sendMessage(message);
  }

  static stop() {
    AppStreamer.stop();
    (AppStreamer as any)._stream = null; // Accessing a private member
  }

  static terminate() {
    AppStreamer.terminate();
  }

  _onStart(message: any) {
    if (
      message.action === "start" &&
      message.status === "success" &&
      !this.state.streamReady
    ) {
      console.info("streamReady");
      this.setState({ streamReady: true });
      this.props.onStarted();
    }

    if (message.status === "error" && StreamConfig.source === "stream") {
      console.log(message.info);
      alert(message.info);
      this.props.onStreamFailed();
      return;
    }
  }

  _onUpdate(message: any) {
    try {
      if (message.action === "authUser" && message.status === "success") {
        this.props.onLoggedIn(message.info);
      }
    } catch (error) {
      console.error(message);
    }
  }

  _onCustomEvent(message: any) {
    this.props.handleCustomEvent(message);
  }

  _onStop(message: any) {
    console.info("Stream stopped", message);
  }

  _onTerminate(message: any) {
    console.info("Stream terminated", message);
  }

  render() {
    const source = StreamConfig.source;

    if (source === "gfn") {
      return (
        <div
          id="view"
          style={{
            backgroundColor: this.state.streamReady ? "white" : "var(--c-dddddd)",
            display: "flex",
            justifyContent: "space-between",
            height: "100%",
            width: "100%",
            ...this.props.style,
          }}
        />
      );
    } else if (source === "local" || source === "stream") {
      return (
        <div
          key={"stream-canvas"}
          id={"main-div"}
          style={{
            visibility: this.state.streamReady ? "visible" : "hidden",
            ...this.props.style,
          }}
        >
          <video
            key={"video-canvas"}
            id={"remote-video"}
            style={{
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
            }}
            tabIndex={-1}
            playsInline
            muted
            autoPlay
          />
        </div>
      );
    }

    return null;
  }
}
