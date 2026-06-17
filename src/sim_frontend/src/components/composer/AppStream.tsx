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
          nativeTouchEvents: true,
          // 让流分辨率自动贴合 video 元素尺寸，消除「固定比例」（等价于原 5183 viewer 的自适应 resize）。
          // width/height 在此仅作【初始值=可向上请求的上限】（库限制最大 4096），fit 只在其范围内向下贴合。
          fitStreamResolution: true,
          width: StreamConfig.local.streamWidth,
          height: StreamConfig.local.streamHeight,
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
            backgroundColor: this.state.streamReady ? "white" : "#dddddd",
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
