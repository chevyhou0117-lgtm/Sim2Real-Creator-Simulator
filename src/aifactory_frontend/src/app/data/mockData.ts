export type NodeStatus = "configured" | "partial" | "empty" | "error";
export type ProjectStatus = "draft" | "complete" | "published" | "archived";
export type AssetStatus = "draft" | "active" | "inactive" | "archived";

export interface FactoryNode {
  id: string;
  name: string;
  type: "factory" | "process" | "line" | "equipment";
  code?: string; // 编码（factory_code, stage_code, line_code, equipment_code）
  sequence?: number; // 顺序（制程用）
  stage_type?: string; // 制程类型（SMT, WAVE_SOLDER等）
  equipment_type?: string; // 设备类型（SMT_MACHINE, SOLDER_PASTE_PRINTER等）
  children?: FactoryNode[];
  status?: NodeStatus;
  iotConfigured?: boolean;
  dataPointCount?: number;
  errorMessage?: string; // 配置错误时的具体错误信息
}

export interface FactoryProject {
  id: string;
  name: string;
  projectVersion: string;
  status: ProjectStatus;
  thumbnail: string;
  updatedAt: string;
  createdAt: string;
  description?: string;
  factory: FactoryNode;
}

export interface FactoryInfo {
  id: string;
  name: string;
  factoryId: string;
  address: string;
  description: string;
  siteLength?: number;
  siteWidth?: number;
}

// export interface AssetLibraryCategory {
//   id: string;
//   name: string;
//   count: number;
//   thumbnail: string;
//   description: string;
//   subcategories: AssetSubCategory[];
// }

// export interface AssetSubCategory {
//   id: string;
//   name: string;
//   count: number;
//   items: AssetItem[];
// }

// export interface AssetItem {
//   id: string;
//   name: string;
//   type: string;
//   category: string;
//   subcategory: string;
//   thumbnail: string;
//   manufacturer?: string;
//   model?: string;
//   usdPath?: string;
//   tags?: string[];
//   status: AssetStatus;
//   referencedByProjects?: number;
//   versions?: AssetVersion[];
// }

export interface AssetVersion {
  id: string;
  versionLabel: string;
  status: AssetStatus;
  usdPath: string;
  polyCount: string;
  fileSize: string;
  createdAt: string;
  createdBy: string;
  description: string;
  copiedFrom?: string;
  referencedByProjects?: number;
  tags?: string[];
}

export interface DataPoint {
  id: string;
  name: string;
  address: string;
  dataType: string;
  unit: string;
  description: string;
  decimals?: number;
  readonly?: boolean;
}

export interface ValidationItem {
  id: string;
  label: string;
  pass: boolean;
  note?: string;
}

// ───────────────────────────────────────────────
// Validation Report Types (PRD 3.5.3 / 3.5.4)
// ───────────────────────────────────────────────
export type ValidationCategory =
  | "quantity-matching"
  | "content-matching"
  | "orphan-instance"
  | "missing-asset"
  | "data-consistency"
  | "completeness"
  | "conflict-resolution";

export type ValidationSeverity = "critical" | "high" | "medium" | "low";
export type ValidationStatus = "passed" | "failed" | "warning";

export interface ValidationIssue {
  id: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  title: string;
  description: string;
  affectedItems: string[];
  suggestion: string;
}

export interface ValidationCategoryResult {
  category: ValidationCategory;
  label: string;
  status: ValidationStatus;
  passCount: number;
  totalCount: number;
  issues: ValidationIssue[];
  description: string;
}

export interface ValidationReport {
  generatedAt: string;
  projectName: string;
  overallStatus: ValidationStatus;
  passRate: number;
  categories: ValidationCategoryResult[];
  allIssues: ValidationIssue[];
  stats: {
    totalInstances: number;
    boundInstances: number;
    orphanInstances: number;
    missingAssets: number;
    conflictCount: number;
    bindingRate: number;
    consistencyRate: number;
  };
}

export function generateValidationReport(
  factoryName = "富士康烟台",
): ValidationReport {
  const issues: ValidationIssue[] = [
    {
      id: "iss-001",
      category: "quantity-matching",
      severity: "high",
      title: "Instance count mismatch — SMT01# Line",
      description:
        "3D scene has 8 equipment instances; business system records show 9 entries for SMT01# Line.",
      affectedItems: ["SMT01# Line", "Reflow Soldering Furnace #9"],
      suggestion:
        "Create the missing 3D instance for Reflow Soldering Furnace #9, or remove the extra business record.",
    },
    {
      id: "iss-002",
      category: "orphan-instance",
      severity: "medium",
      title: "Orphan instance detected — AOI-SPARE-01",
      description:
        'Instance "AOI-SPARE-01" exists in the 3D scene but has no bound business data record.',
      affectedItems: ["AOI-SPARE-01"],
      suggestion:
        "Bind this instance to a business record, or remove it if it is a placeholder.",
    },
    {
      id: "iss-003",
      category: "missing-asset",
      severity: "high",
      title: "Missing 3D asset — Wave Soldering Machine WS-003",
      description:
        "Business system has an active record for WS-003 but no corresponding 3D instance exists in the scene.",
      affectedItems: ["WS-003"],
      suggestion:
        "Drag the Wave Soldering Machine asset from the model library and bind it to record WS-003.",
    },
    {
      id: "iss-004",
      category: "content-matching",
      severity: "medium",
      title: "Field mismatch — equipment name divergence",
      description:
        '3D instance name "Stencil Printer 1-1#" does not match business record name "Solder Paste Printer 1-1". Names must be identical for reliable sync.',
      affectedItems: ["STENCIL-PRINTER-1"],
      suggestion:
        "Update either the 3D instance name or the business record to use a consistent name.",
    },
    {
      id: "iss-005",
      category: "data-consistency",
      severity: "low",
      title: "Sync timestamp stale — Packing Process",
      description:
        "Last sync for Packing Process data was 42 minutes ago, exceeding the 5-minute freshness threshold.",
      affectedItems: ["Packing Process"],
      suggestion:
        "Trigger a manual re-sync for the Packing Process data source.",
    },
    {
      id: "iss-006",
      category: "completeness",
      severity: "critical",
      title: "Required attribute missing — IoT data points",
      description:
        "3 equipment instances are missing mandatory IoT data-point bindings (minimum 5 points required).",
      affectedItems: [
        "Reflow Oven RO-02",
        "SPI Machine SPI-01",
        "X-Ray Inspection XR-01",
      ],
      suggestion:
        "Open each equipment's Data Binding panel and configure the required IoT data points.",
    },
    {
      id: "iss-007",
      category: "conflict-resolution",
      severity: "medium",
      title: "Unresolved data conflict — SMT02# Line capacity",
      description:
        "Capacity value conflicts between 3D instance (1200 UPH) and business system (1050 UPH). No resolution strategy applied.",
      affectedItems: ["SMT02# Line"],
      suggestion:
        "Open the conflict panel and choose the authoritative source, or set the business-system-priority rule.",
    },
  ];

  const categoryDefs: {
    category: ValidationCategory;
    label: string;
    description: string;
  }[] = [
    {
      category: "quantity-matching",
      label: "Quantity Matching",
      description: "3D instance count vs business record count",
    },
    {
      category: "content-matching",
      label: "Content Matching",
      description: "Key field value consistency across systems",
    },
    {
      category: "orphan-instance",
      label: "Orphan Instances",
      description: "3D instances without bound business data",
    },
    {
      category: "missing-asset",
      label: "Missing Assets",
      description: "Business records without corresponding 3D instances",
    },
    {
      category: "data-consistency",
      label: "Data Consistency",
      description: "Cross-system sync freshness and version alignment",
    },
    {
      category: "completeness",
      label: "Binding Completeness",
      description: "Required attributes fully bound for all instances",
    },
    {
      category: "conflict-resolution",
      label: "Conflict Resolution",
      description:
        "Unresolved data conflicts between Creator and business systems",
    },
  ];

  const categories: ValidationCategoryResult[] = categoryDefs.map(
    ({ category, label, description }) => {
      const catIssues = issues.filter((i) => i.category === category);
      const hasCritical = catIssues.some((i) => i.severity === "critical");
      const hasHigh = catIssues.some((i) => i.severity === "high");
      const status: ValidationStatus =
        hasCritical || hasHigh
          ? "failed"
          : catIssues.length > 0
            ? "warning"
            : "passed";
      const totalCount =
        category === "quantity-matching"
          ? 24
          : category === "content-matching"
            ? 23
            : category === "orphan-instance"
              ? 24
              : category === "missing-asset"
                ? 9
                : category === "data-consistency"
                  ? 5
                  : category === "completeness"
                    ? 24
                    : 3;
      const failCount = catIssues.length;
      return {
        category,
        label,
        status,
        passCount: totalCount - failCount,
        totalCount,
        issues: catIssues,
        description,
      };
    },
  );

  const allPassed = categories.filter((c) => c.status === "passed").length;
  const passRate = Math.round((allPassed / categories.length) * 100);

  return {
    generatedAt: new Date().toISOString(),
    projectName: factoryName,
    overallStatus: categories.some((c) => c.status === "failed")
      ? "failed"
      : categories.some((c) => c.status === "warning")
        ? "warning"
        : "passed",
    passRate,
    categories,
    allIssues: issues,
    stats: {
      totalInstances: 24,
      boundInstances: 21,
      orphanInstances: 1,
      missingAssets: 1,
      conflictCount: 1,
      bindingRate: 87.5,
      consistencyRate: 91.7,
    },
  };
}

// ───────────────────────────────────────────────
// Factory Tree Data
// ───────────────────────────────────────────────
export const houstonFactoryTree: FactoryNode = {
  id: "houston-p9",
  name: "富士康烟台",
  type: "factory",
  code: "HOUSTON-P9",
  children: [
    {
      id: "smt-process",
      name: "SMT Process",
      type: "process",
      code: "SMT",
      sequence: 1,
      stage_type: "SMT",
      children: [
        {
          id: "smt01-line",
          name: "SMT01# Line",
          type: "line",
          code: "SMT01",
          children: [
            {
              id: "stencil-printer-1",
              name: "1-1# Stencil Printer",
              type: "equipment",
              code: "STENCIL-PRINTER-1",
              equipment_type: "SOLDER_PASTE_PRINTER",
              iotConfigured: true,
              dataPointCount: 12,
            },
            {
              id: "stencil-printer-11",
              name: "1-2# Stencil Printer",
              type: "equipment",
              iotConfigured: true,
              dataPointCount: 12,
            },
            {
              id: "chip-mounter-1",
              name: "1-1# Chip Mounter",
              type: "equipment",
              iotConfigured: true,
              dataPointCount: 9,
            },
            {
              id: "chip-mounter-11",
              name: "1-2# Chip Mounter",
              type: "equipment",
              iotConfigured: true,
              dataPointCount: 9,
            },
            {
              id: "reflow-furnace-1",
              name: "Reflow Soldering Furnace",
              type: "equipment",
              iotConfigured: false,
              dataPointCount: 9,
            },
          ],
        },
        {
          id: "smt02-line",
          name: "SMT02# Line",
          type: "line",
          errorMessage: "",
          children: [
            {
              id: "stencil-printer-2",
              name: "2-1# Stencil Printer",
              type: "equipment",
              iotConfigured: true,
              dataPointCount: 12,
            },
            {
              id: "chip-mounter-2",
              name: "2-1# Chip Mounter",
              type: "equipment",
              iotConfigured: true,
              dataPointCount: 9,
              errorMessage:
                "Binding Error: platform record key identifier changed, unable to auto-match",
            },
            {
              id: "reflow-furnace-2",
              name: "Reflow Soldering Furnace",
              type: "equipment",
              iotConfigured: false,
              dataPointCount: 9,
            },
            {
              id: "error-equipment",
              name: "配置错误的设备",
              type: "equipment",
              iotConfigured: false,
              dataPointCount: 0,
              errorMessage:
                "设备缺少必需属性：IP地址、设备型号未配置；IoT连接测试失败",
            },
          ],
        },
        {
          id: "smt03-line",
          name: "SMT03# Line",
          type: "line",
          children: [
            {
              id: "smt03-stencil-printer",
              name: "1# Stencil Printer",
              type: "equipment",
              iotConfigured: false,
              dataPointCount: 0,
            },
            {
              id: "smt03-chip-mounter",
              name: "1# Chip Mounter",
              type: "equipment",
              iotConfigured: false,
              dataPointCount: 0,
            },
            {
              id: "smt03-reflow-furnace",
              name: "Reflow Soldering Furnace",
              type: "equipment",
              iotConfigured: false,
              dataPointCount: 0,
            },
          ],
        },
      ],
    },
    {
      id: "pth-process",
      name: "PTH Process",
      type: "process",
      code: "PTH",
      sequence: 2,
      stage_type: "WAVE_SOLDER",
      children: [
        {
          id: "pth01-line",
          name: "PTH01# Line",
          type: "line",
          code: "PTH01",
          children: [],
        },
      ],
    },
    {
      id: "assembly-process",
      name: "Assembly Process",
      type: "process",
      code: "ASSEMBLY",
      sequence: 3,
      stage_type: "MANUAL_ASSEMBLY",
      children: [
        {
          id: "module-assy-line",
          name: "Module Assy Line",
          type: "line",
          code: "MODULE-ASSY",
          children: [],
        },
        {
          id: "coldplate-assy-line",
          name: "Coldplate Assy Line",
          type: "line",
          code: "COLDPLATE-ASSY",
          children: [],
        },
        {
          id: "sort-repair-line",
          name: "Sort/Quick Repair Line",
          type: "line",
          code: "SORT-REPAIR",
          children: [],
        },
        {
          id: "coldplate-disassy-line",
          name: "Coldplate Disassy Line",
          type: "line",
          code: "COLDPLATE-DISASSY",
          children: [],
        },
      ],
    },
    {
      id: "testing-process",
      name: "Testing Process",
      type: "process",
      code: "TESTING",
      sequence: 4,
      stage_type: "OTHER",
      children: [
        {
          id: "electrical-testing",
          name: "ELECTRICAL Testing",
          type: "line",
          code: "ELECTRICAL-TESTING",
          children: [],
        },
        {
          id: "podroom-testing",
          name: "PODROOM Testing",
          type: "line",
          code: "PODROOM-TESTING",
          children: [],
        },
      ],
    },
    {
      id: "packing-process",
      name: "Packing Process",
      type: "process",
      code: "PACKING",
      sequence: 5,
      stage_type: "OTHER",
      children: [
        {
          id: "packing-01-line",
          name: "Packing 01# Line",
          type: "line",
          code: "PACKING-01",
          children: [],
        },
      ],
    },
    {
      id: "error-process",
      name: "Error Process (配置错误)",
      type: "process",
      status: "error", // 新增错误状态process
      errorMessage: "工序配置验证失败：缺少负责人信息，产能数据与父工厂不匹配",
      children: [
        {
          id: "error-line-1",
          name: "Error Line #1",
          type: "line",
          status: "error",
          errorMessage: "产线配置不完整：缺少批次配置，AGV路线冲突",
          children: [],
        },
        {
          id: "error-line-2",
          name: "Error Line #2",
          type: "line",
          status: "partial",
          children: [],
        },
      ],
    },
  ],
};

export const californiaFactoryTree: FactoryNode = {
  id: "california",
  name: "California AI Factory",
  type: "factory",
  status: "configured",
  children: [
    {
      id: "ca-smt-process",
      name: "SMT Process",
      type: "process",
      status: "configured",
      children: [
        {
          id: "ca-smt01-line",
          name: "SMT01# Line",
          type: "line",
          status: "configured",
          children: [],
        },
      ],
    },
    {
      id: "ca-assembly-process",
      name: "Assembly Process",
      type: "process",
      status: "configured",
      children: [
        {
          id: "ca-module-assy",
          name: "Module Assy Line",
          type: "line",
          status: "configured",
          children: [],
        },
      ],
    },
  ],
};

// ───────────────────────────────────────────────
// Factory Projects
// ───────────────────────────────────────────────
export const mockFactoryProjects: FactoryProject[] = [
  {
    id: "houston-p9",
    name: "富士康烟台",
    projectVersion: "_V1",
    status: "published",
    thumbnail:
      "https://images.unsplash.com/photo-1700713400904-f5c3d71a748b?w=600&q=80",
    updatedAt: "2025-12-20",
    createdAt: "2025-06-01",
    description: "Houston Texas P9 AI Server Manufacturing Factory",
    factory: houstonFactoryTree,
  },
  {
    id: "california",
    name: "California AI Factory",
    projectVersion: "_V1",
    status: "complete",
    thumbnail:
      "https://images.unsplash.com/photo-1669003152226-b37b58281b84?w=600&q=80",
    updatedAt: "2025-11-15",
    createdAt: "2025-08-01",
    description: "California AI Server Assembly Factory",
    factory: californiaFactoryTree,
  },
  {
    id: "shenzhen-p3",
    name: "Shenzhen P3 AI Factory",
    projectVersion: "_V1",
    status: "draft",
    thumbnail:
      "https://images.unsplash.com/photo-1647427060118-4911c9821b82?w=600&q=80",
    updatedAt: "2026-04-10",
    createdAt: "2026-03-01",
    description: "Shenzhen P3 新一代AI服务器制造工厂，规划中",
    factory: houstonFactoryTree,
  },
  {
    id: "legacy-2024",
    name: "Legacy Factory 2024",
    projectVersion: "_V1",
    status: "archived",
    thumbnail: "",
    updatedAt: "2024-12-31",
    createdAt: "2024-01-01",
    description: "2024年旧版工厂项目，已归档不可修改",
    factory: californiaFactoryTree,
  },
];

// ───────────────────────────────────────────────
// Asset Library
// ───────────────────────────────────────────────
export const assetLibraryCategories: AssetLibraryCategory[] = [
  {
    id: "smt",
    name: "SMT Asset Library",
    count: 24,
    thumbnail:
      "https://images.unsplash.com/photo-1748349221526-33b51820b21e?w=400&q=80",
    description: "Surface Mount Technology production lines and equipment",
    subcategories: [
      {
        id: "smt-lines",
        name: "SMT Lines",
        count: 4,
        items: [
          {
            id: "smt-complete-line",
            name: "SMT Complete Line",
            type: "Production Line",
            category: "smt",
            subcategory: "smt-lines",
            thumbnail:
              "https://images.unsplash.com/photo-1748349221526-33b51820b21e?w=300&q=80",
            manufacturer: "Generic",
            model: "SMT-L-001",
            status: "active",
          },
          {
            id: "smt-mini-line",
            name: "Mini SMT Line",
            type: "Production Line",
            category: "smt",
            subcategory: "smt-lines",
            thumbnail:
              "https://images.unsplash.com/photo-1748349221526-33b51820b21e?w=300&q=80",
            manufacturer: "Generic",
            model: "SMT-L-002",
            status: "draft",
          },
        ],
      },
      {
        id: "stencil-printers",
        name: "Stencil Printers",
        count: 5,
        items: [
          {
            id: "dek-printer_V1.0",
            name: "DEK NeoHorizon 03iX",
            type: "Equipment",
            category: "smt",
            subcategory: "stencil-printers",
            thumbnail:
              "https://images.unsplash.com/photo-1748349221526-33b51820b21e?w=300&q=80",
            manufacturer: "DEK",
            model: "NeoHorizon 03iX",
            status: "inactive",
            referencedByProjects: 1,
            // versions: [
            //   {
            //     id: 'dek-v1', versionLabel: 'V1.0', status: 'inactive',
            //     usdPath: '/assets/usd/dek_neohorizon_v1.usd', polyCount: '98,300', fileSize: '14.7 MB',
            //     createdAt: '2023-07-22', createdBy: 'Chen Jing',
            //     description: 'Initial stencil printer model. Camera assembly simplified.',
            //     referencedByProjects: 0,
            //   },
            //   {
            //     id: 'dek-v2', versionLabel: 'V2.0', status: 'active',
            //     usdPath: '/assets/usd/dek_neohorizon_v2.usd', polyCount: '112,600', fileSize: '17.3 MB',
            //     createdAt: '2024-02-14', createdBy: 'Chen Jing',
            //     description: 'Rebuilt camera and vision system geometry. Aligned with real DEK spec sheet.',
            //     referencedByProjects: 1,
            //   },
            // ],
          },
          {
            id: "mpm-printer",
            name: "MPM Momentum",
            type: "Equipment",
            category: "smt",
            subcategory: "stencil-printers",
            thumbnail:
              "https://images.unsplash.com/photo-1748349221526-33b51820b21e?w=300&q=80",
            manufacturer: "MPM",
            model: "Momentum II",
            status: "inactive",
          },
        ],
      },
      {
        id: "chip-mounters",
        name: "Chip Mounters",
        count: 8,
        items: [
          {
            id: "sm471",
            name: "SM471 Plus Chip Mounter",
            type: "Equipment",
            category: "smt",
            subcategory: "chip-mounters",
            thumbnail:
              "https://images.unsplash.com/photo-1748349221526-33b51820b21e?w=300&q=80",
            manufacturer: "Samsung",
            model: "SM471 Plus",
            status: "draft",
            referencedByProjects: 3,
            // versions: [
            //   {
            //     id: 'sm471-v1', versionLabel: 'V1.0', status: 'archived',
            //     usdPath: '/assets/usd/sm471_v1.usd', polyCount: '124,500', fileSize: '18.2 MB',
            //     createdAt: '2023-03-10', createdBy: 'Zhang Wei',
            //     description: 'Initial release of SM471 Plus chip mounter model.',
            //     referencedByProjects: 0,
            //   },
            //   {
            //     id: 'sm471-v2', versionLabel: 'V2.0', status: 'active',
            //     usdPath: '/assets/usd/sm471_v2.usd', polyCount: '138,200', fileSize: '21.4 MB',
            //     createdAt: '2023-11-05', createdBy: 'Li Ming',
            //     description: 'Updated nozzle head geometry and feeder rail detail. Used in 富士康烟台 factory (legacy line).',
            //     referencedByProjects: 2,
            //   },
            //   {
            //     id: 'sm471-v3', versionLabel: 'V3.0', status: 'active',
            //     usdPath: '/assets/usd/sm471_v3.usd', polyCount: '152,800', fileSize: '24.6 MB',
            //     createdAt: '2024-06-18', createdBy: 'Li Ming',
            //     description: 'High-fidelity rework with PBR materials. Used in Shenzhen P3 new build.',
            //     referencedByProjects: 1,
            //   },
            //   {
            //     id: 'sm471-v4', versionLabel: 'V4.0', status: 'draft',
            //     usdPath: '/assets/usd/sm471_v4_wip.usd', polyCount: '160,000', fileSize: '27.1 MB',
            //     createdAt: '2024-12-01', createdBy: 'Wang Fang',
            //     description: 'Work-in-progress: adding conveyor animation rig.',
            //     referencedByProjects: 0,
            //   },
            // ],
          },
          {
            id: "sm481",
            name: "SM481 Plus Chip Mounter",
            type: "Equipment",
            category: "smt",
            subcategory: "chip-mounters",
            thumbnail:
              "https://images.unsplash.com/photo-1748349221526-33b51820b21e?w=300&q=80",
            manufacturer: "Samsung",
            model: "SM481 Plus",
            status: "active",
          },
          {
            id: "fnx9",
            name: "Fuji NXT3",
            type: "Equipment",
            category: "smt",
            subcategory: "chip-mounters",
            thumbnail:
              "https://images.unsplash.com/photo-1748349221526-33b51820b21e?w=300&q=80",
            manufacturer: "Fuji",
            model: "NXT3",
            status: "draft",
          },
        ],
      },
      {
        id: "reflow-ovens",
        name: "Reflow Ovens",
        count: 5,
        items: [
          {
            id: "kurtz-ersa",
            name: "Kurtz Ersa Reflow 1000",
            type: "Equipment",
            category: "smt",
            subcategory: "reflow-ovens",
            thumbnail:
              "https://images.unsplash.com/photo-1748349221526-33b51820b21e?w=300&q=80",
            manufacturer: "Kurtz Ersa",
            model: "Reflow 1000",
            status: "active",
          },
          {
            id: "heller-reflow",
            name: "Heller 1800EXL Reflow Oven",
            type: "Equipment",
            category: "smt",
            subcategory: "reflow-ovens",
            thumbnail:
              "https://images.unsplash.com/photo-1748349221526-33b51820b21e?w=300&q=80",
            manufacturer: "Heller",
            model: "1800EXL",
            status: "archived",
          },
        ],
      },
    ],
  },
  {
    id: "assembly",
    name: "Assembly Asset Library",
    count: 18,
    thumbnail:
      "https://images.unsplash.com/photo-1647427060118-4911c9821b82?w=400&q=80",
    description: "Assembly lines and automation equipment for product assembly",
    subcategories: [
      {
        id: "assy-lines",
        name: "Assembly Lines",
        count: 6,
        items: [
          {
            id: "module-assy",
            name: "Module Assy Line",
            type: "Production Line",
            category: "assembly",
            subcategory: "assy-lines",
            thumbnail:
              "https://images.unsplash.com/photo-1647427060118-4911c9821b82?w=300&q=80",
            manufacturer: "Generic",
            status: "active",
          },
          {
            id: "auto-assy",
            name: "Automation Assembly Line",
            type: "Production Line",
            category: "assembly",
            subcategory: "assy-lines",
            thumbnail:
              "https://images.unsplash.com/photo-1647427060118-4911c9821b82?w=300&q=80",
            manufacturer: "Generic",
            status: "draft",
          },
        ],
      },
      {
        id: "robots",
        name: "Robots & Arms",
        count: 9,
        items: [
          {
            id: "kuka-kr10",
            name: "KUKA KR 10 R1100-2",
            type: "Equipment",
            category: "assembly",
            subcategory: "robots",
            thumbnail:
              "https://images.unsplash.com/photo-1647427060118-4911c9821b82?w=300&q=80",
            manufacturer: "KUKA",
            model: "KR 10 R1100-2",
            status: "active",
            referencedByProjects: 2,
            versions: [
              {
                id: "kuka-v1",
                versionLabel: "V1.0",
                status: "archived",
                usdPath: "/assets/usd/kuka_kr10_v1.usd",
                polyCount: "210,400",
                fileSize: "32.1 MB",
                createdAt: "2023-01-15",
                createdBy: "Liu Yang",
                description:
                  "Base model. Joint covers and cable management not modeled.",
                referencedByProjects: 0,
              },
              {
                id: "kuka-v2",
                versionLabel: "V2.0",
                status: "active",
                usdPath: "/assets/usd/kuka_kr10_v2.usd",
                polyCount: "248,700",
                fileSize: "38.5 MB",
                createdAt: "2024-03-28",
                createdBy: "Liu Yang",
                description:
                  "Full joint articulation rig added. Cable harness geometry included.",
                referencedByProjects: 2,
              },
            ],
          },
          {
            id: "fanuc-lr",
            name: "Fanuc LR Mate 200iD",
            type: "Equipment",
            category: "assembly",
            subcategory: "robots",
            thumbnail:
              "https://images.unsplash.com/photo-1647427060118-4911c9821b82?w=300&q=80",
            manufacturer: "Fanuc",
            model: "LR Mate 200iD",
            status: "inactive",
            referencedByProjects: 1,
          },
        ],
      },
    ],
  },
  {
    id: "packing",
    name: "Packing Asset Library",
    count: 12,
    thumbnail:
      "https://images.unsplash.com/photo-1755937303351-57ad0f70f773?w=400&q=80",
    description: "Packing and packaging automation equipment and lines",
    subcategories: [
      {
        id: "packing-lines",
        name: "Packing Lines",
        count: 5,
        items: [
          {
            id: "auto-pack-line",
            name: "Auto Packing Line A",
            type: "Production Line",
            category: "packing",
            subcategory: "packing-lines",
            thumbnail:
              "https://images.unsplash.com/photo-1755937303351-57ad0f70f773?w=300&q=80",
            manufacturer: "Generic",
            status: "active",
          },
        ],
      },
      {
        id: "packing-machines",
        name: "Packing Machines",
        count: 7,
        items: [
          {
            id: "box-packer",
            name: "Box Packer Machine",
            type: "Equipment",
            category: "packing",
            subcategory: "packing-machines",
            thumbnail:
              "https://images.unsplash.com/photo-1755937303351-57ad0f70f773?w=300&q=80",
            manufacturer: "Generic",
            status: "draft",
          },
        ],
      },
    ],
  },
  {
    id: "robotic",
    name: "Robotic Asset Library",
    count: 31,
    thumbnail:
      "https://images.unsplash.com/photo-1761195696590-3490ea770aa1?w=400&q=80",
    description: "Industrial robots and collaborative robot systems",
    subcategories: [
      {
        id: "industrial-robots",
        name: "Industrial Robots",
        count: 19,
        items: [
          {
            id: "abb-irb",
            name: "ABB IRB 6700",
            type: "Equipment",
            category: "robotic",
            subcategory: "industrial-robots",
            thumbnail:
              "https://images.unsplash.com/photo-1761195696590-3490ea770aa1?w=300&q=80",
            manufacturer: "ABB",
            model: "IRB 6700",
            status: "active",
            referencedByProjects: 4,
            versions: [
              {
                id: "abb-v1",
                versionLabel: "V1.0",
                status: "archived",
                usdPath: "/assets/usd/abb_irb6700_v1.usd",
                polyCount: "185,200",
                fileSize: "28.4 MB",
                createdAt: "2022-09-05",
                createdBy: "Zhang Wei",
                description:
                  "First 3D model of IRB 6700. Approximated geometry.",
                referencedByProjects: 0,
              },
              {
                id: "abb-v2",
                versionLabel: "V2.0",
                status: "active",
                usdPath: "/assets/usd/abb_irb6700_v2.usd",
                polyCount: "224,500",
                fileSize: "34.7 MB",
                createdAt: "2023-05-18",
                createdBy: "Zhang Wei",
                description:
                  "Precision rebuild from ABB STEP files. Used in older factory projects.",
                referencedByProjects: 2,
              },
              {
                id: "abb-v3",
                versionLabel: "V3.0",
                status: "active",
                usdPath: "/assets/usd/abb_irb6700_v3.usd",
                polyCount: "267,100",
                fileSize: "41.2 MB",
                createdAt: "2024-08-30",
                createdBy: "Wang Fang",
                description:
                  "PBR material overhaul, wrist cable detail added. For new factory deployments.",
                referencedByProjects: 2,
                tags: ["PBR", "high-fidelity"],
              },
            ],
          },
          {
            id: "yaskawa-motoman",
            name: "Yaskawa Motoman GP8",
            type: "Equipment",
            category: "robotic",
            subcategory: "industrial-robots",
            thumbnail:
              "https://images.unsplash.com/photo-1761195696590-3490ea770aa1?w=300&q=80",
            manufacturer: "Yaskawa",
            model: "Motoman GP8",
            status: "active",
            referencedByProjects: 2,
          },
          {
            id: "kawasaki-duro",
            name: "Kawasaki Duo A200",
            type: "Equipment",
            category: "robotic",
            subcategory: "industrial-robots",
            thumbnail:
              "https://images.unsplash.com/photo-1761195696590-3490ea770aa1?w=300&q=80",
            manufacturer: "Kawasaki",
            model: "Duo A200",
            status: "archived",
          },
        ],
      },
      {
        id: "cobots",
        name: "Collaborative Robots",
        count: 13,
        items: [
          {
            id: "ur5e",
            name: "Universal Robots UR5e",
            type: "Equipment",
            category: "robotic",
            subcategory: "cobots",
            thumbnail:
              "https://images.unsplash.com/photo-1761195696590-3490ea770aa1?w=300&q=80",
            manufacturer: "Universal Robots",
            model: "UR5e",
            status: "draft",
          },
        ],
      },
    ],
  },
];

// ───────────────────────────────────────────────
// Recent Facilities (recently edited models)
// ───────────────────────────────────────────────
export const recentFacilities = [
  {
    id: "smt-line-model",
    name: "SMT Line",
    thumbnail:
      "https://images.unsplash.com/photo-1748349221526-33b51820b21e?w=400&q=80",
    type: "Production Line",
    updatedAt: "2025-12-18",
  },
  {
    id: "pth-line-model",
    name: "PTH Line",
    thumbnail:
      "https://images.unsplash.com/photo-1700713400904-f5c3d71a748b?w=400&q=80",
    type: "Production Line",
    updatedAt: "2025-12-15",
  },
  {
    id: "sm471-chip",
    name: "SM471 Plus Chip Mounter",
    thumbnail:
      "https://images.unsplash.com/photo-1669003152226-b37b58281b84?w=400&q=80",
    type: "Equipment",
    updatedAt: "2025-12-10",
  },
  {
    id: "auto-assy-model",
    name: "Automation Assembly Line",
    thumbnail:
      "https://images.unsplash.com/photo-1647427060118-4911c9821b82?w=400&q=80",
    type: "Production Line",
    updatedAt: "2025-12-08",
  },
];

// ───────────────────────────────────────────────
// Mock Data Points
// ───────────────────────────────────────────────
export const mockDataPoints: DataPoint[] = [
  {
    id: "dp1",
    name: "报警开始",
    address: "alarm_start",
    dataType: "string",
    unit: "-",
    description: "设备报警开始信号",
    decimals: 0,
    readonly: true,
  },
  {
    id: "dp2",
    name: "报警结束",
    address: "alarm_end",
    dataType: "string",
    unit: "-",
    description: "设备报警结束信号",
    decimals: 0,
    readonly: true,
  },
  {
    id: "dp3",
    name: "报警信息",
    address: "alarm_msg",
    dataType: "string",
    unit: "-",
    description: "报警详细信息内容",
    decimals: 0,
    readonly: true,
  },
  {
    id: "dp4",
    name: "运行记录",
    address: "rcount",
    dataType: "uint32",
    unit: "pcs",
    description: "运行计数记录",
    decimals: 0,
    readonly: true,
  },
  {
    id: "dp5",
    name: "最大产量",
    address: "heat_ct_nt",
    dataType: "double",
    unit: "pcs/h",
    description: "最大理论产量",
    decimals: 2,
    readonly: false,
  },
  {
    id: "dp6",
    name: "炉温区域1",
    address: "heat_zone_1",
    dataType: "double",
    unit: "°C",
    description: "回流焊炉第1区温度",
    decimals: 1,
    readonly: true,
  },
  {
    id: "dp7",
    name: "炉温区域2",
    address: "heat_zone_2",
    dataType: "double",
    unit: "°C",
    description: "回流焊炉第2区温度",
    decimals: 1,
    readonly: true,
  },
  {
    id: "dp8",
    name: "N2流量控制",
    address: "n2_value_t",
    dataType: "double",
    unit: "L/min",
    description: "N2氮气流量控制值",
    decimals: 2,
    readonly: false,
  },
  {
    id: "dp9",
    name: "N2平均流量",
    address: "n2_flow_avg",
    dataType: "double",
    unit: "L/min",
    description: "N2氮气平均流量值",
    decimals: 2,
    readonly: true,
  },
];

// ───────────────────────────────────────────────
// Version History
// ───────────────────────────────────────────────
export interface ProjectVersion {
  id: string;
  projectId: string;
  version: string;
  createdAt: string;
  createdBy: string;
  comment: string;
  status: "active" | "archived";
  changeCount: number;
  changeSummary: string[];
}

export const mockVersionHistory: ProjectVersion[] = [
  {
    id: "v6",
    projectId: "houston-p9",
    version: "v2.3.0",
    createdAt: "2025-12-20 14:32",
    createdBy: "Grace Liu",
    comment: "完成PTH产线数据绑定配置，更新IoT连接参数",
    status: "active",
    changeCount: 12,
    changeSummary: [
      "Updated IoT config for PTH01 Line",
      "Added 4 new data binding rules",
      "Fixed Assembly process node order",
    ],
  },
  {
    id: "v5",
    projectId: "houston-p9",
    version: "v2.2.1",
    createdAt: "2025-12-18 09:15",
    createdBy: "Tom Chen",
    comment: "修复Reflow炉IoT连接异常，补充N2流量数据点",
    status: "archived",
    changeCount: 5,
    changeSummary: [
      "Fixed Reflow Oven IoT connection",
      "Added N2 flow data points",
      "Updated alarm thresholds",
    ],
  },
  {
    id: "v4",
    projectId: "houston-p9",
    version: "v2.2.0",
    createdAt: "2025-12-15 16:48",
    createdBy: "Grace Liu",
    comment: "SMT产线3D模型全部完成，添加贴片机设备属性",
    status: "archived",
    changeCount: 23,
    changeSummary: [
      "Added SM471 Plus model",
      "Configured 3 chip mounters",
      "Updated USD paths for all SMT equipment",
    ],
  },
  {
    id: "v3",
    projectId: "houston-p9",
    version: "v2.1.0",
    createdAt: "2025-12-10 11:20",
    createdBy: "Mia Wang",
    comment: "新增Testing产线，配置电气测试工位数据点",
    status: "archived",
    changeCount: 18,
    changeSummary: [
      "Added ELECTRICAL Testing line",
      "Configured test data points",
      "Updated factory capacity settings",
    ],
  },
  {
    id: "v2",
    projectId: "houston-p9",
    version: "v2.0.0",
    createdAt: "2025-11-28 10:05",
    createdBy: "Tom Chen",
    comment: "大版本升级：完成工厂布局重新规划，新增Packing产线",
    status: "archived",
    changeCount: 47,
    changeSummary: [
      "Redesigned factory floor plan",
      "Added Packing process area",
      "Migrated all equipment to USD format",
    ],
  },
  {
    id: "v1",
    projectId: "houston-p9",
    version: "v1.0.0",
    createdAt: "2025-06-01 09:00",
    createdBy: "Grace Liu",
    comment: "初始版本 - 基础SMT产线结构",
    status: "archived",
    changeCount: 0,
    changeSummary: ["Initial project creation"],
  },
];

// ───────────────────────────────────────────────
// Users
// ───────────────────────────────────────────────
export type UserRole =
  | "admin"
  | "ie_engineer"
  | "planner"
  | "model_engineer"
  | "viewer";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  lastLogin: string;
  status: "active" | "inactive" | "locked";
  projectCount: number;
}

export const mockUsers: AppUser[] = [
  {
    id: "u1",
    name: "Grace Liu",
    email: "grace.liu@company.com",
    role: "ie_engineer",
    department: "IE Dept - Houston",
    lastLogin: "2025-12-20 14:32",
    status: "active",
    projectCount: 3,
  },
  {
    id: "u2",
    name: "Tom Chen",
    email: "tom.chen@company.com",
    role: "ie_engineer",
    department: "IE Dept - Houston",
    lastLogin: "2025-12-20 09:15",
    status: "active",
    projectCount: 2,
  },
  {
    id: "u3",
    name: "Mia Wang",
    email: "mia.wang@company.com",
    role: "planner",
    department: "Factory Planning",
    lastLogin: "2025-12-19 16:48",
    status: "active",
    projectCount: 5,
  },
  {
    id: "u4",
    name: "Alex Zhang",
    email: "alex.zhang@company.com",
    role: "model_engineer",
    department: "3D Modeling Team",
    lastLogin: "2025-12-18 11:20",
    status: "active",
    projectCount: 0,
  },
  {
    id: "u5",
    name: "Linda Wu",
    email: "linda.wu@company.com",
    role: "admin",
    department: "IT Dept",
    lastLogin: "2025-12-20 08:00",
    status: "active",
    projectCount: 0,
  },
  {
    id: "u6",
    name: "Kevin Li",
    email: "kevin.li@company.com",
    role: "viewer",
    department: "Production Dept",
    lastLogin: "2025-12-15 10:00",
    status: "inactive",
    projectCount: 0,
  },
  {
    id: "u7",
    name: "Sarah Zhou",
    email: "sarah.zhou@company.com",
    role: "ie_engineer",
    department: "IE Dept - California",
    lastLogin: "2025-12-17 14:00",
    status: "active",
    projectCount: 1,
  },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "System Admin",
  ie_engineer: "IE Engineer",
  planner: "Factory Planner",
  model_engineer: "3D Model Engineer",
  viewer: "Viewer",
};

// ───────────────────────────────────────────────
// Audit Logs
// ───────────────────────────────────────────────
export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  module: string;
  action: string;
  target: string;
  result: "success" | "failure";
  ip: string;
  detail?: string;
}

export const mockAuditLogs: AuditLog[] = [
  {
    id: "a1",
    timestamp: "2025-12-20 14:32:05",
    user: "Grace Liu",
    module: "Factory Project",
    action: "Save Version",
    target: "富士康烟台 v2.3.0",
    result: "success",
    ip: "192.168.1.101",
  },
  {
    id: "a2",
    timestamp: "2025-12-20 14:28:12",
    user: "Grace Liu",
    module: "Data Binding",
    action: "Create Binding Rule",
    target: "PTH01 Line → ERP-LINE-CODE",
    result: "success",
    ip: "192.168.1.101",
  },
  {
    id: "a3",
    timestamp: "2025-12-20 11:15:33",
    user: "Tom Chen",
    module: "Asset Library",
    action: "Upload Model",
    target: "Reflow Oven v2.1 (USD)",
    result: "success",
    ip: "192.168.1.102",
  },
  {
    id: "a4",
    timestamp: "2025-12-20 10:42:17",
    user: "Linda Wu",
    module: "System Admin",
    action: "Add User",
    target: "Kevin Li (viewer)",
    result: "success",
    ip: "192.168.1.105",
  },
  {
    id: "a5",
    timestamp: "2025-12-19 16:55:04",
    user: "Mia Wang",
    module: "Integration",
    action: "Sync Data",
    target: "基础数据平台 → ERP",
    result: "success",
    ip: "192.168.1.103",
  },
  {
    id: "a6",
    timestamp: "2025-12-19 15:30:22",
    user: "Alex Zhang",
    module: "Asset Library",
    action: "Publish Model",
    target: "ABB IRB 6700 v1.0",
    result: "success",
    ip: "192.168.1.104",
  },
  {
    id: "a7",
    timestamp: "2025-12-19 14:12:08",
    user: "Tom Chen",
    module: "Integration",
    action: "Test Connection",
    target: "MES System API",
    result: "failure",
    ip: "192.168.1.102",
    detail: "Connection timeout after 30s",
  },
  {
    id: "a8",
    timestamp: "2025-12-19 09:00:01",
    user: "Linda Wu",
    module: "System Admin",
    action: "Update System Config",
    target: "Auto-save interval: 5min",
    result: "success",
    ip: "192.168.1.105",
  },
  {
    id: "a9",
    timestamp: "2025-12-18 17:22:44",
    user: "Grace Liu",
    module: "Factory Project",
    action: "Export Layout",
    target: "富士康烟台 - Floor Plan PDF",
    result: "success",
    ip: "192.168.1.101",
  },
  {
    id: "a10",
    timestamp: "2025-12-18 11:05:19",
    user: "Sarah Zhou",
    module: "Factory Project",
    action: "Create Project",
    target: "California AI Factory v2",
    result: "success",
    ip: "192.168.1.107",
  },
];

// ───────────────────────────────────────────────
// Integration / Data Sources
// ───────────────────────────────────────────────
export type SyncStrategy = "realtime" | "scheduled" | "manual";
export type SourceStatus = "connected" | "disconnected" | "error" | "syncing";

export interface DataSource {
  id: string;
  name: string;
  type: "platform" | "erp" | "mes" | "wms" | "custom";
  endpoint: string;
  status: SourceStatus;
  lastSync?: string;
  nextSync?: string;
  syncStrategy: SyncStrategy;
  scheduleInterval?: number;
  recordCount?: number;
  errorMessage?: string;
  description: string;
}

export const mockDataSources: DataSource[] = [
  {
    id: "ds-platform",
    name: "基础数据平台",
    type: "platform",
    endpoint: "https://platform.company.com/api/v2",
    status: "connected",
    lastSync: "2025-12-20 14:00:00",
    nextSync: "2025-12-20 15:00:00",
    syncStrategy: "scheduled",
    scheduleInterval: 60,
    recordCount: 15482,
    description: "统一业务数据平台，整合ERP/MES/WMS数据",
  },
  {
    id: "ds-erp",
    name: "ERP System",
    type: "erp",
    endpoint: "https://erp.company.com/api/factory",
    status: "connected",
    lastSync: "2025-12-20 13:55:00",
    syncStrategy: "scheduled",
    scheduleInterval: 60,
    recordCount: 8234,
    description: "设备主数据、物料数据、生产计划",
  },
  {
    id: "ds-mes",
    name: "MES System",
    type: "mes",
    endpoint: "https://mes.company.com/api/v1",
    status: "error",
    lastSync: "2025-12-19 14:12:00",
    syncStrategy: "realtime",
    recordCount: 4892,
    errorMessage: "Connection timeout after 30s",
    description: "设备实时状态、生产执行数据、工艺参数",
  },
  {
    id: "ds-wms",
    name: "WMS System",
    type: "wms",
    endpoint: "https://wms.company.com/api",
    status: "connected",
    lastSync: "2025-12-20 12:00:00",
    nextSync: "2025-12-21 00:00:00",
    syncStrategy: "scheduled",
    scheduleInterval: 720,
    recordCount: 2356,
    description: "物料库存、库位信息、出入库记录",
  },
];

// ───────────────────────────────────────────────
// Binding Rules
// ───────────────────────────────────────────────
export type BindingType = "override" | "mapping" | "merge";
export type BindingStatus = "bound" | "pending" | "error" | "conflict";

export interface BindingRule {
  id: string;
  nodeId: string;
  nodeName: string;
  sourceField: string;
  targetField: string;
  bindingType: BindingType;
  required: boolean;
  lastSynced?: string;
  status: BindingStatus;
  sourceValue?: string;
  targetValue?: string;
}

export const mockBindingRules: BindingRule[] = [
  {
    id: "br1",
    nodeId: "smt02-line",
    nodeName: "SMT02# Line",
    sourceField: "LINE_CODE",
    targetField: "line.code",
    bindingType: "mapping",
    required: true,
    lastSynced: "2025-12-20 14:00",
    status: "bound",
    sourceValue: "SMT-02-HOU",
    targetValue: "SMT-02-HOU",
  },
  {
    id: "br2",
    nodeId: "smt02-line",
    nodeName: "SMT02# Line",
    sourceField: "LINE_NAME",
    targetField: "line.name",
    bindingType: "mapping",
    required: true,
    lastSynced: "2025-12-20 14:00",
    status: "bound",
    sourceValue: "SMT线02号",
    targetValue: "SMT02# Line",
  },
  {
    id: "br3",
    nodeId: "smt02-line",
    nodeName: "SMT02# Line",
    sourceField: "STANDARD_CT",
    targetField: "line.standardCT",
    bindingType: "override",
    required: true,
    lastSynced: "2025-12-20 14:00",
    status: "bound",
    sourceValue: "45s",
    targetValue: "45s",
  },
  {
    id: "br4",
    nodeId: "smt02-line",
    nodeName: "SMT02# Line",
    sourceField: "MAX_UPH",
    targetField: "line.maxUPH",
    bindingType: "merge",
    required: false,
    lastSynced: "2025-12-20 14:00",
    status: "conflict",
    sourceValue: "1200",
    targetValue: "1350",
  },
  {
    id: "br5",
    nodeId: "stencil-printer-1",
    nodeName: "1# Stencil Printer",
    sourceField: "EQUIP_CODE",
    targetField: "equipment.code",
    bindingType: "mapping",
    required: true,
    lastSynced: "2025-12-20 14:00",
    status: "bound",
    sourceValue: "DEK-NHZ-001",
    targetValue: "DEK-NHZ-001",
  },
  {
    id: "br6",
    nodeId: "stencil-printer-1",
    nodeName: "1# Stencil Printer",
    sourceField: "MAINTENANCE_DATE",
    targetField: "equipment.lastMaintenance",
    bindingType: "mapping",
    required: false,
    lastSynced: "2025-12-18 10:00",
    status: "bound",
    sourceValue: "2025-12-01",
    targetValue: "2025-12-01",
  },
  {
    id: "br7",
    nodeId: "chip-mounter-1",
    nodeName: "1# Chip Mounter",
    sourceField: "EQUIP_STATUS",
    targetField: "equipment.status",
    bindingType: "override",
    required: true,
    status: "pending",
  },
  {
    id: "br8",
    nodeId: "reflow-furnace-1",
    nodeName: "Reflow Soldering Furnace",
    sourceField: "EQUIP_CODE",
    targetField: "equipment.code",
    bindingType: "mapping",
    required: true,
    status: "error",
  },
];

// ───────────────────────────────────────────────
// System Config
// ───────────────────────────────────────────────
export interface SysConfigItem {
  id: string;
  group: string;
  key: string;
  label: string;
  value: string;
  type: "string" | "number" | "boolean" | "select";
  options?: string[];
  description: string;
}

export const mockSysConfig: SysConfigItem[] = [
  {
    id: "cfg1",
    group: "General",
    key: "auto_save_interval",
    label: "Auto-save Interval",
    value: "5",
    type: "number",
    description: "Auto-save project every N minutes (1-60)",
  },
  {
    id: "cfg2",
    group: "General",
    key: "max_undo_steps",
    label: "Max Undo Steps",
    value: "50",
    type: "number",
    description: "Maximum undo/redo history steps",
  },
  {
    id: "cfg3",
    group: "General",
    key: "default_view",
    label: "Default 3D View",
    value: "perspective",
    type: "select",
    options: ["perspective", "top", "front", "isometric"],
    description: "Default viewport camera mode",
  },
  {
    id: "cfg4",
    group: "Performance",
    key: "max_instances",
    label: "Max Asset Instances",
    value: "5000",
    type: "number",
    description: "Maximum asset instances per project",
  },
  {
    id: "cfg5",
    group: "Performance",
    key: "lod_enabled",
    label: "LOD Auto-switch",
    value: "true",
    type: "boolean",
    description: "Automatically reduce model detail at distance",
  },
  {
    id: "cfg6",
    group: "Performance",
    key: "shadow_quality",
    label: "Shadow Quality",
    value: "medium",
    type: "select",
    options: ["off", "low", "medium", "high"],
    description: "3D shadow rendering quality",
  },
  {
    id: "cfg7",
    group: "Security",
    key: "session_timeout",
    label: "Session Timeout (min)",
    value: "120",
    type: "number",
    description: "Auto logout after N minutes of inactivity",
  },
  {
    id: "cfg8",
    group: "Security",
    key: "audit_retention_days",
    label: "Audit Log Retention (days)",
    value: "180",
    type: "number",
    description: "Days to retain audit log records",
  },
  {
    id: "cfg9",
    group: "Security",
    key: "require_2fa",
    label: "Require 2FA",
    value: "false",
    type: "boolean",
    description: "Require two-factor authentication for all users",
  },
  {
    id: "cfg10",
    group: "Notifications",
    key: "notify_sync_failure",
    label: "Notify on Sync Failure",
    value: "true",
    type: "boolean",
    description: "Send notification when data sync fails",
  },
  {
    id: "cfg11",
    group: "Notifications",
    key: "notify_version_publish",
    label: "Notify on Version Publish",
    value: "true",
    type: "boolean",
    description: "Send notification when project version is published",
  },
];

// ───────────────────────────────────────────────
// Validation Rules Generator
// ───────────────────────────────────────────────
export function generateValidationItems(
  status: ProjectStatus,
): ValidationItem[] {
  const isPub = status === "published";
  const isComp = status === "complete" || isPub;
  return [
    {
      id: "v1",
      label: "Factory instance requested information incompleted",
      pass: false,
      note: "Cycle time of SMT02# Line is missing",
    },
    // { id: 'v2', label: 'Factory instance production capacity configured', pass: isComp, note: 'Capacity, UPH, CT values set' },
    {
      id: "v3",
      label: "Production line quantity checked",
      pass: isComp,
      note: "Line quantity of each process matches business data",
    },
    {
      id: "v4",
      label: "Equipment quantity checked",
      pass: isComp,
      note: "Total Equipment quantity and Equipment quantity of each line matches business data",
    },
    {
      id: "v5",
      label:
        "All instances information are aligned with the latest business data",
      pass: isComp,
      note: "Sync time: 2026-04-23",
    },
    // { id: 'v6', label: 'IoT information configured for lines', pass: isComp, note: 'IoT Info configured' },
    // { id: 'v7', label: 'Equipment basic (Ledger) info complete', pass: isComp, note: 'Equipment Name, ID, Type, Brand, Install Date' },
    // { id: 'v8', label: 'Equipment IoT connections configured', pass: false, note: 'Reflow Soldering Furnace IoT not configured' },
    // { id: 'v9', label: 'Data collection points mapped (≥5 per device)', pass: isComp, note: 'All equipment data points assigned' },
    // { id: 'v10', label: 'Error codes and alarm rules defined', pass: isComp, note: '2.3 ErrorCode & Alarm configured' },
    // { id: 'v11', label: 'Status monitoring thresholds set', pass: false, note: 'Packing Process monitoring not configured' },
    // { id: 'v12', label: '3D USD assets linked to all nodes', pass: isComp, note: '3D model references assigned' },
  ];
}

// ───────────────────────────────────────────────
// Project Integration Status
// ───────────────────────────────────────────────
export interface ProjectSourceStatus {
  sourceId: string;
  sourceName: string;
  sourceType: "platform" | "erp" | "mes" | "wms" | "custom";
  status: SourceStatus;
  lastSync?: string;
  endpoint: string;
  description: string;
}

export interface ProjectIntegration {
  projectId: string;
  projectName: string;
  sources: ProjectSourceStatus[];
  overallStatus: "all_connected" | "partial" | "error" | "disconnected";
  lastUpdated: string;
}

export const projectIntegrations: ProjectIntegration[] = [
  {
    projectId: "houston-p9",
    projectName: "富士康烟台",
    overallStatus: "partial",
    lastUpdated: "2025-12-20 14:30",
    sources: [
      {
        sourceId: "ds-platform",
        sourceName: "基础数据平台",
        sourceType: "platform",
        status: "connected",
        lastSync: "2025-12-20 14:00:00",
        endpoint: "https://platform.company.com/api/v2",
        description: "统一业务数据平台，整合ERP/MES/WMS数据",
      },
      {
        sourceId: "ds-erp",
        sourceName: "ERP System",
        sourceType: "erp",
        status: "connected",
        lastSync: "2025-12-20 13:55:00",
        endpoint: "https://erp.company.com/api/factory",
        description: "设备主数据、物料数据、生产计划",
      },
      {
        sourceId: "ds-mes",
        sourceName: "MES System",
        sourceType: "mes",
        status: "error",
        lastSync: "2025-12-19 14:12:00",
        endpoint: "https://mes.company.com/api/v1",
        description: "设备实时状态、生产执行数据、工艺参数",
      },
      {
        sourceId: "ds-wms",
        sourceName: "WMS System",
        sourceType: "wms",
        status: "connected",
        lastSync: "2025-12-20 12:00:00",
        endpoint: "https://wms.company.com/api",
        description: "物料库存、库位信息、出入库记录",
      },
    ],
  },
  {
    projectId: "california",
    projectName: "California AI Factory",
    overallStatus: "all_connected",
    lastUpdated: "2025-12-19 11:20",
    sources: [
      {
        sourceId: "ds-platform",
        sourceName: "基础数据平台",
        sourceType: "platform",
        status: "connected",
        lastSync: "2025-12-19 11:00:00",
        endpoint: "https://platform.company.com/api/v2",
        description: "统一业务数据平台，整合ERP/MES/WMS数据",
      },
      {
        sourceId: "ds-erp",
        sourceName: "ERP System",
        sourceType: "erp",
        status: "connected",
        lastSync: "2025-12-19 10:45:00",
        endpoint: "https://erp.company.com/api/factory",
        description: "设备主数据、物料数据、生产计划",
      },
      {
        sourceId: "ds-mes",
        sourceName: "MES System",
        sourceType: "mes",
        status: "connected",
        lastSync: "2025-12-19 10:30:00",
        endpoint: "https://mes.company.com/api/v1",
        description: "设备实时状态、生产执行数据、工艺参数",
      },
      {
        sourceId: "ds-wms",
        sourceName: "WMS System",
        sourceType: "wms",
        status: "disconnected",
        lastSync: "2025-12-18 09:00:00",
        endpoint: "https://wms.company.com/api",
        description: "物料库存、库位信息、出入库记录",
      },
    ],
  },
  {
    projectId: "test-factory",
    projectName: "测试工厂",
    overallStatus: "error",
    lastUpdated: "2025-12-19 08:15",
    sources: [
      {
        sourceId: "ds-platform",
        sourceName: "基础数据平台",
        sourceType: "platform",
        status: "error",
        lastSync: "2025-12-18 16:20:00",
        endpoint: "https://platform.company.com/api/v2",
        description: "统一业务数据平台，整合ERP/MES/WMS数据",
      },
      {
        sourceId: "ds-erp",
        sourceName: "ERP System",
        sourceType: "erp",
        status: "disconnected",
        lastSync: "2025-12-17 09:00:00",
        endpoint: "https://erp.company.com/api/factory",
        description: "设备主数据、物料数据、生产计划",
      },
      {
        sourceId: "ds-mes",
        sourceName: "MES System",
        sourceType: "mes",
        status: "error",
        lastSync: "2025-12-18 14:12:00",
        endpoint: "https://mes.company.com/api/v1",
        description: "设备实时状态、生产执行数据、工艺参数",
      },
    ],
  },
];

// ───────────────────────────────────────────────
// Factory Info Data (for dropdown selection)
// ───────────────────────────────────────────────
export const factoryInfos: FactoryInfo[] = [
  // Empty option for creating new factory
  {
    id: "",
    name: "Create New Factory",
    factoryId: "",
    address: "",
    description: "",
  },
  {
    id: "houston-p9",
    name: "富士康烟台",
    factoryId: "USAHSTP9AIFactory001",
    address: "8303 Fallbrook Dr., Houston, TX 77064, USA",
    description: "Houston Texas P9 AI Server Manufacturing Factory",
    siteLength: 2000,
    siteWidth: 1500,
  },
  {
    id: "california",
    name: "California AI Factory",
    factoryId: "USACALAIFactory002",
    address: "1 Apple Park Way, Cupertino, CA 95014, USA",
    description: "California AI Server Assembly Factory",
    siteLength: 1800,
    siteWidth: 1200,
  },
];
