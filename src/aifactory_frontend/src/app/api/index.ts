import { Http } from "../utils/http";
import { AxiosProgressEvent } from "axios";
import { baseUrl, ovBaseUrl } from "./baseUrl";

// 主页获取 工序级资产列表
export const getProcessAssetListApi = () => {
  return Http.get(`${baseUrl}/v1/asset-category/process/list`);
};

// 获取资产列表
export const getAssetListApi = (params: any) => {
  return Http.post(`${baseUrl}/v1/asset-category/query`, params);
};

// 获取 资产分类 树结构
export const getFilterAssetCategoryTreeApi = (params: any) => {
  return Http.post(`${baseUrl}/v1/asset-category/filter`, params);
};

// 通过 资产id 获取资产详情
export const getAssetListByIdApi = (categoryId: string) => {
  return Http.get(`${baseUrl}/v1/asset-category/${categoryId}/tree`);
};

export const getEquipmentsByLineApi = (params: any) => {
  return Http.post(`${baseUrl}/v1/line-model-detail/equipment-rel`, params);
};

// 获取 线体资产详情
export const getLineAssetDetailApi = (id: string) => {
  return Http.get(`${baseUrl}/v1/line-model-detail/${id}`);
};

// 获取 设备资产详情
export const getEquipmentAssetDetailApi = (id: any) => {
  return Http.get(`${baseUrl}/v1/equipment-model-detail/${id}`);
};

export const getDownloadAssetFileApi = (
  assetType: string,
  categoryId: string,
) => {
  return Http.get(
    `${baseUrl}/v1/asset-download/${assetType}/download/${categoryId}`,
    { responseType: "blob" },
  );
};

export const getBatchDownloadAssetFileApi = (
  assetType: string,
  categoryIds: string[],
) => {
  return Http.post(`${baseUrl}/v1/asset-download/${assetType}/batch-download`, {
    ids: categoryIds,
  });
};

// 通知打开 ov操作界面
export const notifyOpenOvApi = (params: any) => {
  return Http.post(`${ovBaseUrl}/open_stage`, params);
};

// 上传zip
export const uploadAssetFileApi = (
  params: any,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void,
) => {
  return Http.post(
    `${baseUrl}/v1/asset-upload/upload`,
    params,
    onUploadProgress,
  );
};

//--------------------------------------- 工厂层级专用 ---------------------------------------------

// 获取 工厂项目列表
export const getFactoryProjectListApi = (params: any) => {
  return Http.post(`${baseUrl}/v1/factory-project/query`, params);
};

// 获取 已有的 工厂项目列表 list-with-version
export const getFactoryProjectListWithVersionApi = () => {
  return Http.get(`${baseUrl}/v1/factory-project/list-with-version`);
};

// 创建 工厂项目
export const createFactoryProjectApi = (params: any) => {
  return Http.post(`${baseUrl}/v1/factory-project/create`, params);
};

// 获取 工厂项目 树结构
export const getFactoryProjectTreeApi = (projectId: string) => {
  return Http.get(`${baseUrl}/v1/factory-project/${projectId}`);
};

// 查询工厂详情
export const getFactoryProjectDetailByNodeIdApi = (nodeId: string) => {
  return Http.get(`${baseUrl}/v1/factory-asset-node/${nodeId}/detail`);
};

// 复制 工厂项目
export const duplicateFactoryProjectApi = (params: any) => {
  return Http.post(`${baseUrl}/v1/factory-project/copy`, params);
};

// 删除 工厂项目
export const deleteFactoryProjectApi = (params: any) => {
  return Http.del(`${baseUrl}/v1/factory-project/delete`, params);
};

// 更新 工厂项目
export const updateFactoryProjectApi = (params: any) => {
  return Http.put(`${baseUrl}/v1/factory-project/update`, params);
};

// 上传工厂模型 /api/v1/factory-asset-node/upload-factory-model
export const uploadFactoryModelApi = (
  params: any,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void,
) => {
  return Http.post(
    `${baseUrl}/v1/factory-asset-node/upload-factory-model`,
    params,
    onUploadProgress,
  );
};

// 获取 线体 资产列表 /api/v1/base/production-line/query
export const getLineAssetListApi = (params: any) => {
  return Http.post(`${baseUrl}/v1/base/production-line/query`, params);
};

// 获取 设备 资产列表 /api/v1/base/equipment/query
export const getEquipmentAssetListApi = (params: any) => {
  return Http.post(`${baseUrl}/v1/base/equipment/query`, params);
};

// 获取 设备 资产列表 /api/v1/base/equipment/query-by-line
export const getEquipmentAssetListByLineApi = (params: any) => {
  return Http.post(`${baseUrl}/v1/base/equipment/query-by-line`, params);
};

// 绑定 资产 /api/v1/factory-asset-node/bind
export const bindAssetApi = (params: any) => {
  return Http.post(`${baseUrl}/v1/factory-asset-node/bind`, params);
};

// 解绑 资产 /api/v1/factory-asset-node/unbind
export const unbindAssetApi = (params: any) => {
  return Http.post(`${baseUrl}/v1/factory-asset-node/unbind`, params);
};

// 通知打开 ov操作界面
export const notifyOpenOvFactoryApi = (params: any) => {
  return Http.post(`${ovBaseUrl}/open_factory_stage`, params);
};

// 高亮节点（传入 primPath 数组）
export const highlightNodeApi = (params: { primPath: string[] }) => {
  return Http.post(`${ovBaseUrl}/highlight`, params);
};

// 保存 ov 模型
export const saveOVModelApi = (params: any) => {
  return Http.post(`${ovBaseUrl}/stage/save`, params);
};

// 创建制程节点（STAGE）
export const createStageNodeApi = (params: {
  factoryProjectsId: string;
  name: string;
  type: "STAGE";
  parentId?: string | null;
  code?: string;
  description?: string;
}) => {
  // 过滤掉 undefined / null 的可选字段，避免发送多余 null 值
  const cleanParams: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      cleanParams[key] = val;
    }
  }
  return Http.post(`${baseUrl}/v1/factory-asset-node/create`, cleanParams);
};

// bind lineNode
export const bindLineNodeApi = (params: any) => {
  return Http.post(`${baseUrl}/v1/factory-asset-node/add-line-node`, params);
};

// 删除工厂资产节点（仅允许 LINE / EQUIPMENT 类型）
export const deleteFactoryAssetNodeApi = (id: string) => {
  return Http.del(`${baseUrl}/v1/factory-asset-node/delete`, { id });
};

// 创建资产分类节点（process / line_type / equipment_type）
export const createAssetCategoryApi = (params: {
  name: string;
  code: string;
  type: string;
  parentId: string;
  description?: string;
}) => {
  return Http.post(`${baseUrl}/v1/asset-category/create`, params);
};

// 更新资产分类节点基础信息（适用所有类型：process / line_type / equipment_type / line_model / equipment_model）
export const updateAssetCategoryApi = (params: {
  id: string;
  name?: string;
  code?: string;
  parentId?: string | null;
  description?: string;
}) => {
  return Http.put(`${baseUrl}/v1/asset-category/update`, params);
};

// 删除资产模型叶子节点（line_model / equipment_model）
export const deleteAssetCategoryApi = (id: string) => {
  return Http.del(`${baseUrl}/v1/asset-category/delete`, { id });
};

// 批量删除资产模型叶子节点
export const batchDeleteAssetCategoryApi = (ids: string[]) => {
  return Http.del(`${baseUrl}/v1/asset-category/batch-delete`, { ids });
};

// 批量启用资产模型（line_model / equipment_model）
export const batchEnableAssetApi = (
  assetType: "line" | "equipment",
  ids: string[],
) => {
  return Http.put(
    `${baseUrl}/v1/asset-model-status/${assetType}/batch-enable`,
    { ids },
  );
};

// 批量禁用资产模型（line_model / equipment_model）
export const batchDisableAssetApi = (
  assetType: "line" | "equipment",
  ids: string[],
) => {
  return Http.put(
    `${baseUrl}/v1/asset-model-status/${assetType}/batch-disable`,
    { ids },
  );
};

// 单个激活资产模型
export const enableAssetApi = (
  assetType: "line" | "equipment",
  detailId: string,
) => {
  return Http.put(
    `${baseUrl}/v1/asset-model-status/${assetType}/enable/${detailId}`,
    {},
  );
};

// 单个禁用资产模型
export const disableAssetApi = (
  assetType: "line" | "equipment",
  detailId: string,
) => {
  return Http.put(
    `${baseUrl}/v1/asset-model-status/${assetType}/disable/${detailId}`,
    {},
  );
};

// 单个归档资产模型
export const archiveAssetApi = (
  assetType: "line" | "equipment",
  detailId: string,
) => {
  return Http.put(
    `${baseUrl}/v1/asset-model-status/${assetType}/archive/${detailId}`,
    {},
  );
};

// 更新工厂项目缩略图 POST /factory-project/update-thumbnail
export const updateFactoryProjectThumbnailApi = (
  projectId: string,
  file: File,
) => {
  const formData = new FormData();
  formData.append("project_id", projectId);
  formData.append("file", file);
  return Http.post(`${baseUrl}/v1/factory-project/update-thumbnail`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

// 更新资产缩略图（by category_id）
// type: "line" | "equipment" | "process"
export const updateThumbnailApi = (
  type: "line" | "equipment" | "process",
  categoryId: string,
  file: File,
) => {
  const formData = new FormData();
  formData.append("type", type);
  formData.append("category_id", categoryId);
  formData.append("file", file);
  return Http.post(
    `${baseUrl}/v1/asset-upload/update-thumbnail-by-category`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
};

// 拖拽移动叶子节点到新父节点
export const moveAssetCategoryApi = (params: { id: string; newParentId: string }) => {
  return Http.put(`${baseUrl}/v1/asset-category/move`, params);
};

// ── 线体模型详情更新 ── PUT /line-model-detail/update
export const updateLineModelDetailApi = (params: Record<string, any>) => {
  return Http.put(`${baseUrl}/v1/line-model-detail/update`, params);
};

// ── 设备模型详情更新 ── PUT /equipment-model-detail/update
export const updateEquipmentModelDetailApi = (params: Record<string, any>) => {
  return Http.put(`${baseUrl}/v1/equipment-model-detail/update`, params);
};
