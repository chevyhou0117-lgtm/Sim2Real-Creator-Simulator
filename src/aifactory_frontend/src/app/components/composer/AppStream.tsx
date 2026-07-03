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
import React, { Component } from "react";
import PropTypes from "prop-types";
import {
  AppStreamer,
  StreamEvent,
  StreamProps,
  DirectConfig,
  GFNConfig,
  StreamType,
} from "@nvidia/omniverse-webrtc-streaming-library";
import StreamConfig from "../../../../stream.config.json";
import { kitHost } from "../../utils/runtimeConfig";

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

  static propTypes = {
    onStarted: PropTypes.func.isRequired,
    handleCustomEvent: PropTypes.func.isRequired,
    style: PropTypes.object,
  };

  constructor(props: AppStreamProps) {
    super(props);

    this._requested = false;
    this.state = {
      streamReady: false,
      activeButton: null,
    };

    // this.handleButtonClick = this.handleButtonClick.bind(this);
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
          authenticate: true,
          maxReconnects: 20,
          signalingServer: kitHost(StreamConfig.local.server),
          signalingPort: StreamConfig.local.signalingPort,
          mediaServer: kitHost(StreamConfig.local.server),
          ...(StreamConfig.local.mediaPort != null && {
            mediaPort: StreamConfig.local.mediaPort,
          }),
          nativeTouchEvents: true,
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
    // AppStream.stop();
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
    console.log("[AppStream] _onCustomEvent called, message:", message);
    this.props.handleCustomEvent(message);
  }

  _onStop(message: any) {
    console.info("Stream stopped", message);
  }

  _onTerminate(message: any) {
    console.info("Stream terminated", message);
  }

  // handleButtonClick(buttonType: string) {
  //     this.setState(prevState => ({
  //         activeButton: prevState.activeButton === buttonType ? null : buttonType
  //     }));
  //     const reset_message = {
  //         event_type: "testRequest",
  //         payload: { a:5 }
  //     };
  //     AppStream.sendMessage(JSON.stringify(reset_message));
  // }

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
            // backgroundColor:this.state.streamReady ? 'white': 'var(--c-dddddd)',
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
          {/* <audio id="remote-audio" muted></audio> */}
          {/* <h3 style={{ visibility: 'hidden' }} id="message-display">...</h3> */}

          {/* <div className="interactiveButtons">
                        <button 
                            className={`interactiveButton velocity ${this.state.activeButton === 'velocity' ? 'active' : ''}`}
                            onClick={() => this.handleButtonClick('velocity')}
                        >
                            Velocity
                        </button>
                        <button 
                            className={`interactiveButton temperature ${this.state.activeButton === 'temperature' ? 'active' : ''}`}
                            onClick={() => this.handleButtonClick('temperature')}
                        >
                            Temperature
                        </button>
                        <button 
                            className={`interactiveButton pressure ${this.state.activeButton === 'pressure' ? 'active' : ''}`}
                            onClick={() => this.handleButtonClick('pressure')}
                        >
                            Pressure
                        </button>
                    </div> */}
        </div>
      );
    }

    return null;
  }
}
