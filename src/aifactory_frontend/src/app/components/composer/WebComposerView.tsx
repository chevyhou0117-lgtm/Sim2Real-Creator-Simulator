import React, { useState, useEffect, useRef } from "react";
import AppStream from "./AppStream";
import StreamConfig from "../../../../stream.config.json";
import {
  getStreamingSessionInfo,
  createStreamingSession,
  destroyStreamingSession,
  StreamItem,
} from "./Endpoints";
import { t } from "../../utils/i18n";
import "./WebComposerView.css";

interface AppStreamMessageType {
  event_type: string;
  payload: any;
}

const WebComposerView: React.FC<{
  rootUsdPath: string;
  onDragNodeComplete: (node: any) => void;
}> = ({ rootUsdPath, onDragNodeComplete }) => {
  // console.log("WebComposerView: rootUsdPath = " + rootUsdPath);

  // 流相关配置
  // 参考 FactoryCreator.tsx 中的逻辑，从创建的流会话中获取配置
  // 这里使用硬编码值，模拟从 API 获取的结果
  const sessionId = "test-session"; // 从 createdStream.id 获取
  const streamServer = StreamConfig.stream.streamServer; // 从 StreamConfig.stream.streamServer 获取
  const backendUrl = `${streamServer}/streaming/stream`; // 构建后端 URL
  const signalingserver = StreamConfig.local.server; // 从 StreamConfig.local.server 获取
  const signalingport = StreamConfig.local.signalingPort; // 从 signalingData.source_port 获取，参考 local 模式下的 signalingPort
  const mediaserver = StreamConfig.local.server; // 从 Object.keys(createdStream.routes)[0] 获取，参考 local 模式下的 server
  const mediaport = StreamConfig.local.mediaPort; // 从 mediaData.source_port 获取，使用一个合理的默认值
  const accessToken = ""; // 设为空字符串

  // 类型定义
  interface USDPrimType {
    name?: string;
    path: string;
    children?: USDPrimType[];
  }

  // 状态管理
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>(
    StreamConfig.source === "gfn"
      ? t("editor.stream.loggingInGfn")
      : StreamConfig.source === "stream" || StreamConfig.source === "local"
        ? t("editor.stream.waitingForInit")
        : t("editor.stream.waitingForBegin"),
  );
  const [showStream, setShowStream] = useState<boolean>(true);
  const [isKitReady, setIsKitReady] = useState<boolean>(false);
  const [streamStarted, setStreamStarted] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [usdPrims, setUsdPrims] = useState<USDPrimType[]>([]);
  const [selectedUSDPrims, setSelectedUSDPrims] = useState<Set<USDPrimType>>(
    new Set<USDPrimType>(),
  );

  const [dragNodeId, setDragNodeId] = useState<string>("");

  // 查询加载状态
  const queryLoadingState = (): void => {
    const message: AppStreamMessageType = {
      event_type: "loadingStateQuery",
      payload: {},
    };
    AppStream.sendMessage(JSON.stringify(message));
  };

  // 轮询 Kit 是否准备就绪
  const pollForKitReady = () => {
    if (isKitReady) return;

    console.info("polling Kit availability");
    queryLoadingState();
    // 清除之前的定时器
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }
    // 存储新的定时器 ID
    pollTimerRef.current = setTimeout(pollForKitReady, 3000); // 每 3 秒轮询一次
  };

  // 流开始时的处理
  const onStreamStarted = (): void => {
    setStreamStarted(true);
    pollForKitReady();
  };

  /**
   * @function _findUSDPrimByPath
   *
   * Recursive search for a USDPrimType object by path.
   */
  const _findUSDPrimByPath = (
    path: string,
    array: USDPrimType[] = usdPrims,
  ): USDPrimType | null => {
    if (Array.isArray(array)) {
      for (const obj of array) {
        if (obj.path === path) {
          return obj;
        }
        if (obj.children && obj.children.length > 0) {
          const found = _findUSDPrimByPath(path, obj.children);
          if (found) {
            return found;
          }
        }
      }
    }
    return null;
  };

  /**
   * @function _makePickable
   *
   * Send a request to make prims pickable/selectable.
   * By default the client requests to make only a handful of the prims selectable - leaving the background items unselectable.
   */
  const _makePickable = (usdPrims: USDPrimType[]): void => {
    const paths: string[] = usdPrims.map((prim) => prim.path);
    console.log(`Sending request to make prims pickable: ${paths}.`);
    const message: AppStreamMessageType = {
      event_type: "makePrimsPickable",
      payload: {
        paths: paths,
      },
    };
    AppStream.sendMessage(JSON.stringify(message));
  };

  // 登录处理
  const onLoggedIn = (userId: string): void => {
    if (StreamConfig.source === "gfn") {
      console.info(`Logged in to GeForce NOW as ${userId}`);
      setLoadingText(t("editor.stream.waitingForBegin"));
      setIsLoading(false);
    }
  };

  // 处理自定义事件
  const handleCustomEvent = (event: any): void => {
    console.log(event);
    if (!event) {
      return;
    }

    // 响应 'loadingStateQuery' 请求
    if (event.event_type == "loadingStateResponse") {
      // loadingStateRequest 用于轮询 Kit 的生命周期。
      // 对于第一个 loadingStateResponse，我们将 isKitReady 设置为 true
      // 并运行一个更多的查询来找出 Kit 中的当前加载状态
      if (!isKitReady) {
        console.info("Kit is ready to load assets");
        setIsKitReady(true);
        queryLoadingState();
      } else {
        // 如果舞台有效且已完成加载，则显示流
        if (event.payload.loading_state === "idle") {
          console.log(
            "[customEvent loadingStateResponse] Loading_stage completed",
          );
          setShowStream(true);
          setLoadingText(t("editor.stream.assetLoaded"));
          setIsLoading(false);
        }
      }
    }

    // 加载活动通知
    else if (event.event_type === "updateProgressActivity") {
      console.log("Kit App communicates progress activity.");
      if (loadingText !== t("editor.stream.loadingAsset")) {
        setLoadingText(t("editor.stream.loadingAsset"));
        setIsLoading(true);
      }
    }

    // Notification from Kit about user changing the selection via the viewport.
    else if (event.event_type === "stageSelectionChanged") {
      console.log(event.payload.prims.constructor.name);
      if (
        !Array.isArray(event.payload.prims) ||
        event.payload.prims.length === 0
      ) {
        console.log("Kit App communicates an empty stage selection.");
        setSelectedUSDPrims(new Set<USDPrimType>());
      } else {
        console.log(
          "Kit App communicates selection of a USDPrimType: " +
            event.payload.prims.map((obj: any) => obj).join(", "),
        );
        const usdPrimsToSelect: Set<USDPrimType> = new Set<USDPrimType>();
        event.payload.prims.forEach((obj: any) => {
          const result = _findUSDPrimByPath(obj);
          if (result !== null) {
            usdPrimsToSelect.add(result);
          }
        });
        setSelectedUSDPrims(usdPrimsToSelect);
      }
    }

    // Streamed app provides children of a parent USDPrimType
    else if (event.event_type === "getChildrenResponse") {
      console.log("Kit App sent stage prims");
      const prim_path = event.payload.prim_path;
      const children = event.payload.children;
      const usdPrim = _findUSDPrimByPath(prim_path);
      if (usdPrim === null) {
        setUsdPrims(children);
      } else {
        usdPrim.children = children;
        setUsdPrims([...usdPrims]);
      }
      if (Array.isArray(children)) {
        _makePickable(children);
      }
    }
    // 用于OV模型打开成功的判断
    else if (event.event_type === "openedStageResult") {
      console.log("[customEvent openedStageResult] Stage opened successfully");
      setIsLoading(false);
      setShowStream(true);
    }
    // 自定义的模型拖拽成功事件回调
    else if (event.event_type === "openUsdResult") {
      console.log(
        "[customEvent openUsdResult] openUsdResult payload:",
        event.payload,
      );
      if (event.payload && event.payload.result === "success") {
        // 拖拽完成，通知刷新
        let payload = event.payload || {};
        payload.lineId = dragNodeId;
        onDragNodeComplete(payload);
      } else {
        console.error(
          "[customEvent openUsdResult] Failed to add USD asset:",
          event.payload?.error,
          event.payload?.usdUrl,
        );
      }
    }
  };

  // 处理 AppStream 焦点
  const handleAppStreamFocus = (): void => {
    console.log("User is interacting in streamed viewer");
  };

  // 处理 AppStream 失焦
  const handleAppStreamBlur = (): void => {
    console.log("User is not interacting in streamed viewer");
  };

  // 处理流失败
  const handleStreamFailed = (): void => {
    console.error("Stream failed to start");
    setLoadingText(t("editor.stream.streamFailed"));
    setIsLoading(false);
    if (StreamConfig.source === "stream" && streamServer && sessionId) {
      void destroyStreamingSession(streamServer, sessionId).catch((error) => {
        console.warn("Error destroying failed streaming session:", error);
      });
    }
  };

  // ==================== 拖放处理 ====================

  /**
   * 资产节点拖拽开始（来自 AssetCategoryTree）
   */
  const _handleNodeDragStart = (node: any): void => {
    console.log("[App] 资产拖拽开始:", node.name);
  };

  /**
   * 资产节点拖拽结束
   */
  const _handleNodeDragEnd = (): void => {
    setIsDragOver(false);
  };

  /**
   * 拖拽经过流媒体区域 - 必须阻止默认行为才能允许 drop
   */
  const _handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    e.stopPropagation();
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  /**
   * 拖拽离开流媒体区域
   */
  const _handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    // 只在真正离开容器时才取消高亮（避免子元素触发）
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  };

  /**
   * 资产节点放到流媒体区域 - 发送 open_usd_request 到 Kit
   * 包含屏幕坐标，后端通过 add_asset_by_screen 精确定位放置
   */
  const _handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    console.log("[DEBUG] _handleDrop triggered");
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    console.log("[DEBUG] _handleDrop E:", e);
    const jsonData = e.dataTransfer.getData("application/json");
    console.log("[DEBUG] _handleDrop jsonData:", jsonData);
    if (!jsonData) {
      console.warn("[customEvent _handleDrop] Drop 事件无数据");
      return;
    }

    try {
      const dragData = JSON.parse(jsonData);
      console.log("[customEvent _handleDrop] 拖放到流媒体区域:", dragData);
      setDragNodeId(dragData?.detail?.id);

      // instancePath 为资产“实例化”路径；线体/设备资产当前不会生成 instancePath（始终为 null），
      // 故回退到 rootUsdPath —— OV 据此拼接 MinIO 前缀构建完整 URL 并实例化到场景。
      const instancePath =
        dragData?.detail?.instancePath || dragData?.detail?.rootUsdPath;
      if (instancePath) {
        // 计算相对于流媒体容器的屏幕坐标，用于后端精确定位放置
        const rect = e.currentTarget.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        // 传入 instance_path，后端拼接 MinIO 前缀构建完整 URL
        const msg = {
          event_type: "open_usd_request",
          payload: {
            instance_path: instancePath,
            screen_x: screenX,
            screen_y: screenY,
          },
        };
        AppStream.sendMessage(JSON.stringify(msg));
        console.log("[customEvent _handleDrop] 已发送 open_usd_request:", msg);
      } else {
        console.warn(
          "[customEvent _handleDrop] 拖放的节点没有 instancePath/rootUsdPath:",
          dragData,
        );
      }
    } catch (err) {
      console.error("[customEvent _handleDrop] 解析拖拽数据失败:", err);
    }
  };

  // 监听 rootUsdPath 变化
  useEffect(() => {
    console.log("[WebComposerView] rootUsdPath:", rootUsdPath);
    if (rootUsdPath && rootUsdPath !== "") {
      // 当 rootUsdPath 有值时，开始 loading（等待流初始化）
      console.log("[WebComposerView] rootUsdPath has value, starting loading");
      if (StreamConfig.source === "stream" || StreamConfig.source === "local") {
        setIsLoading(true);
        setShowStream(false);
      }
    }
    // else {
    //   // 当 rootUsdPath 为空时，取消 loading
    //   console.log("[WebComposerView] rootUsdPath is empty, clearing loading");
    //   setIsLoading(false);
    //   setShowStream(true);
    // }
  }, [rootUsdPath]);

  // 组件卸载时清理流媒体资源
  useEffect(() => {
    return () => {
      console.info("Cleaning up streaming resources...");
      // 清除轮询定时器
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      // 只有在流真正启动时才清理流媒体资源
      if (streamStarted) {
        try {
          if (StreamConfig.source === "stream" && streamServer && sessionId) {
            void destroyStreamingSession(streamServer, sessionId).catch(
              (error) => {
                console.warn("Error destroying streaming session:", error);
              },
            );
          }
          AppStream.terminate();
        } catch (error) {
          console.warn("Error terminating stream:", error);
        }
      }
      // setIsLoading(false);
      // setShowStream(true);
    };
  }, [streamStarted]);

  return (
    <div className="web-composer-view">
      {/* 流区域 */}
      <div
        className="stream-container"
        onDragOver={_handleDragOver}
        onDragLeave={_handleDragLeave}
      >
        {/* 拖放覆盖层 - 确保能捕获拖放事件 */}
        <div
          className={`stream-drop-overlay ${isDragOver ? "active drag-over" : ""}`}
          onDrop={_handleDrop}
        />

        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-content">
              <div className="loading-spinner"></div>
              <div className="loading-text">{loadingText}</div>
            </div>
          </div>
        )}

        <AppStream
          sessionId={sessionId}
          backendUrl={backendUrl}
          signalingserver={signalingserver}
          signalingport={signalingport}
          mediaserver={mediaserver}
          mediaport={mediaport}
          accessToken={accessToken}
          onStarted={onStreamStarted}
          onFocus={handleAppStreamFocus}
          onBlur={handleAppStreamBlur}
          style={{
            position: "relative",
            visibility: showStream ? "visible" : "hidden",
          }}
          onLoggedIn={onLoggedIn}
          handleCustomEvent={handleCustomEvent}
          onStreamFailed={handleStreamFailed}
        />
      </div>
    </div>
  );
};

export default WebComposerView;
