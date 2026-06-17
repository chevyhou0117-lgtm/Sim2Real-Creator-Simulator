export interface CategoryNode {
  id: string;
  name: string;
  code: string;
  description: string;
  detail: any;
  parentId: string | null;
  thumbnailPath: string | null;
  type: string;
  status?: AssetStatus;
  count?: number;
  referencedByProjects?: number;
  children: CategoryNode[];
  assetIds?: string[];
  // i18n 翻译字段（后端通过 Accept-Language: en 注入）
  name_en?: string;
  description_en?: string;
}

export interface AssetItemDetail {
  id: string;
  name: string;
  type: string;
  category: string;
  categoryId: string;
  thumbnailPath: string;
  rootUsdPath: string;
  status: AssetStatus;
  isCurrent?: boolean;
  bucketName?: string;
  width?: number;
  height?: number;
  depth?: number;
  manufacturer?: string;
  model?: string;
  polyCount?: number;
  remark?: string;
  versionTag?: string;
  primPath?: string;
  instancePath?: string;
  locationPath?: string;
  // i18n 翻译字段（后端通过 Accept-Language: en 注入）
  name_en?: string;
  remark_en?: string;
}

export type NodeStatus = "configured" | "partial" | "empty" | "error";
export type ProjectStatus = "DRAFT" | "COMPLETE" | "PUBLISHED" | "ARCHIVED";
export type AssetStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";

export interface AssetVersion {
  id: string;
  versionLabel: string;
  status: AssetStatus;
  usdPath: string;
  polyCount: string;
}
