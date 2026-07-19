import React, { useState, useRef, useEffect } from "react";
import "./UploadAsset.css";
import { uploadAssetFileApi } from "../../api";
import { t, useLocalized } from "../../utils/i18n";
import { toast } from "sonner";

import iconUpload from "../../assets/icon_upload2.png";

const isZipFile = (file: File) => /\.zip$/i.test(file.name);

interface UploadAssetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const UploadAsset: React.FC<UploadAssetProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadType, setUploadType] = useState<string>("equipment");
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 确保语言切换时组件重渲染
  useLocalized();

  // 每次打开时重置上传状态;
  useEffect(() => {
    if (isOpen && !isUploading) {
      setFile(null);
      setProgress(0);
      setIsUploading(false);
      setUploadSuccess(false);
    }
  }, [isOpen, isUploading]);

  const changeUploadType = (type: string) => {
    if (isUploading) {
      return;
    }
    setUploadType(type);
  };

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    if (!isZipFile(selectedFile)) {
      e.target.value = "";
      setFile(null);
      toast.error(t("asset.upload.zipOnly"));
      return;
    }

    setFile(selectedFile);
    void handleUpload(selectedFile);
  };

  // 处理拖拽事件
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    if (!isZipFile(droppedFile)) {
      setFile(null);
      toast.error(t("asset.upload.zipOnly"));
      return;
    }

    setFile(droppedFile);
    void handleUpload(droppedFile);
  };

  // 处理上传
  const handleUpload = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setProgress(0);
    setUploadSuccess(false);

    try {
      // 创建 FormData 对象
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", uploadType);

      // 调用上传接口，添加进度监听
      await uploadAssetFileApi(formData, (progressEvent) => {
        // console.log("上传进度:", progressEvent);
        if (progressEvent.total) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total,
          );
          setProgress(progress);
        }
      });
      console.log("上传成功");
      // 先设置上传成功状态，保持进度条显示
      // setIsUploading(false);
      setUploadSuccess(true);

      // 上传成功后调用回调
      if (onSuccess) {
        onSuccess();
      }

      // 延迟关闭，让用户看到成功提示
      setTimeout(() => {
        setProgress(0);
        setFile(null);
        setIsUploading(false);
        setUploadSuccess(false);
        onClose();
      }, 3000);
    } catch (error) {
      console.error("上传失败:", error);
      // 上传失败处理
      setProgress(0);
      setFile(null);
      setIsUploading(false);
      setUploadSuccess(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.error(
        error instanceof Error
          ? error.message
          : t("asset.upload.uploadFailed"),
      );
    }
  };

  // 处理取消
  const handleCancel = () => {
    // setFile(null);
    // setProgress(0);
    // setIsUploading(false);
    // setUploadSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="upload-asset-overlay">
      <div className="upload-asset-dialog">
        <div className="upload-asset-header">
          <h2>{t("asset.uploadAsset")}</h2>
          <button className="close-button" onClick={handleCancel}>
            ×
          </button>
        </div>
        <div className="upload-asset-content">
          <div
            className="upload-area"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="file-input"
              accept=".zip"
            />
            <div className="upload-icon">
              <img src={iconUpload} alt="Upload" />
            </div>
            <p className="upload-text">
              {t("asset.upload.dragHint")}{" "}
              <span className="upload-link">{t("asset.upload.uploadLink")}</span>
            </p>
            <div className="upload-type">
              <span className="upload-type-label">{t("asset.upload.uploadType")}</span>
              <div className="upload-type-options">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="uploadType"
                    value="line"
                    checked={uploadType === "line"}
                    onChange={(e) => changeUploadType(e.target.value)}
                  />
                  <span>{t("asset.upload.productionLine")}</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="uploadType"
                    value="equipment"
                    checked={uploadType === "equipment"}
                    onChange={(e) => changeUploadType(e.target.value)}
                  />
                  <span>{t("asset.upload.equipment")}</span>
                </label>
              </div>
            </div>
            {file && (
              <div className="file-info">
                <p>{file.name}</p>
                <p>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            )}
            {(isUploading || uploadSuccess) && (
              <div className="upload-progress">
                <div
                  className="progress-bar"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: uploadSuccess ? "#4CAF50" : "#3498db",
                  }}
                />
                <p className="progress-text">
                  {uploadSuccess ? t("asset.upload.uploadSuccess") : `${progress}%`}
                </p>
              </div>
            )}
            {!isUploading && (
              <button
                className="upload-button"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L14 8H10V14H6V8H2L8 2Z" fill="white" />
                </svg>
                {t("asset.upload.clickToUpload")}
              </button>
            )}
          </div>
        </div>
        <div className="upload-asset-footer">
          {/* <button className="cancel-button" onClick={handleCancel}>
            Cancel
          </button> */}
          {/* <button
            className="confirm-button"
            onClick={handleUpload}
            disabled={!file || isUploading}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </button> */}
          <button className="confirm-button" onClick={handleCancel}>
            {t("asset.upload.done")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadAsset;
