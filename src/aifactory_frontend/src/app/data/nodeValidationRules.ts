/**
 * 节点必填字段验证规则
 * 基于数据模型（Appendix_A_DataModel_DataDictionary.md）和PRD文档定义
 *
 * 规则：
 * 1. 参考数据模型中的「是否必填」列
 * 2. 排除系统自动生成的ID字段
 * 3. 排除外键字段（数据库必填但UI可不考虑）
 * 4. 结合UI交互文档中的实际业务必填项
 */

import { FactoryNode } from './mockData';

export interface RequiredField {
  fieldPath: string;  // 字段路径，如 'name' 或 'properties.basicInfo.name'
  label: string;      // 显示名称，如 '节点名称'
  validate?: (value: any) => boolean; // 自定义验证函数
}

export type NodeType = FactoryNode['type']; // 'factory' | 'process' | 'line' | 'equipment'

/**
 * 每种节点类型的必填字段定义
 *
 * 注意：当前FactoryNode接口较为简单，主要包含基本字段。
 * 实际业务中，节点可能有更复杂的属性结构（如basicInfo、capacityInfo等）。
 * 此处先定义基础必填字段，后续可根据实际属性结构扩展。
 */
export const REQUIRED_FIELDS_BY_TYPE: Record<NodeType, RequiredField[]> = {
  factory: [
    // 工厂节点 - 参考数据模型2.1 Factory表，排除ID、外键、创建更新时间
    { fieldPath: 'name', label: '工厂名称' },
    { fieldPath: 'code', label: '工厂编码' },
    // timezone 字段当前FactoryNode未包含，暂不添加
  ],
  process: [
    // 制程节点 - 参考数据模型2.1 Stage表
    { fieldPath: 'name', label: '制程名称' },
    { fieldPath: 'code', label: '制程编码' },
    { fieldPath: 'sequence', label: '顺序' },
    { fieldPath: 'stage_type', label: '制程类型' },
  ],
  line: [
    // 产线节点 - 参考数据模型2.1 ProductionLine表
    { fieldPath: 'name', label: '产线名称' },
    { fieldPath: 'code', label: '产线编码' },
  ],
  equipment: [
    // 设备节点 - 参考数据模型2.1 EquipmentBase表
    { fieldPath: 'name', label: '设备名称' },
    { fieldPath: 'code', label: '设备编码' },
    { fieldPath: 'equipment_type', label: '设备类型' },
  ],
};

/**
 * 检查字段是否已填写
 * 条件：值不为undefined、null、空字符串，且通过自定义验证（如果有）
 */
export function isFieldFilled(value: any, validate?: (value: any) => boolean): boolean {
  if (value === undefined || value === null || value === '') {
    return false;
  }
  // 如果是数组或对象，检查是否有内容
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'object' && Object.keys(value).length === 0) return false;

  // 执行自定义验证
  if (validate && !validate(value)) return false;

  return true;
}

/**
 * 根据路径获取对象中的值
 * 支持简单路径（如 'name'）和嵌套路径（如 'properties.basicInfo.name'）
 */
export function getValueByPath(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * 计算节点的必填字段完成数量
 * @returns [filledCount, totalCount]
 */
export function calculateRequiredFieldCompletion(node: FactoryNode): [number, number] {
  const requiredFields = REQUIRED_FIELDS_BY_TYPE[node.type] || [];
  if (requiredFields.length === 0) {
    return [0, 0]; // 无必填字段要求
  }

  const filledCount = requiredFields.filter(field => {
    const value = getValueByPath(node, field.fieldPath);
    return isFieldFilled(value, field.validate);
  }).length;

  return [filledCount, requiredFields.length];
}