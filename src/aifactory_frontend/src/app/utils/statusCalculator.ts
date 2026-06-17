/**
 * 节点状态计算工具
 * 根据节点属性完整性自动计算配置状态
 */

import { FactoryNode, NodeStatus } from '../data/mockData';
import {
  REQUIRED_FIELDS_BY_TYPE,
  calculateRequiredFieldCompletion,
  getValueByPath,
  isFieldFilled
} from '../data/nodeValidationRules';

/**
 * 计算节点配置状态
 * 规则：
 * 1. 有错误信息 → 'error'
 * 2. 无必填字段 → 'configured'（视为已配置）
 * 3. 所有必填字段有值 → 'configured'
 * 4. 部分必填字段有值 → 'partial'
 * 5. 无必填字段有值 → 'empty'
 *
 * 注意：ID字段（系统自动生成）和外键字段（数据库必填但UI可不考虑）已排除在REQUIRED_FIELDS_BY_TYPE之外
 */
export function calculateNodeStatus(node: FactoryNode): NodeStatus {
  // 1. 检查错误状态
  if (node.errorMessage) {
    return 'error';
  }

  // 2. 获取必填字段完成情况
  const [filledCount, totalCount] = calculateRequiredFieldCompletion(node);

  // 3. 根据完成情况返回状态
  if (totalCount === 0) {
    // 无必填字段要求，视为已配置
    return 'configured';
  }

  if (filledCount === 0) {
    return 'empty';
  }

  if (filledCount === totalCount) {
    return 'configured';
  }

  return 'partial';
}

/**
 * 批量计算节点状态（优化性能）
 */
export function calculateNodeStatuses(nodes: FactoryNode[]): Map<string, NodeStatus> {
  const statusMap = new Map<string, NodeStatus>();
  nodes.forEach(node => {
    statusMap.set(node.id, calculateNodeStatus(node));
  });
  return statusMap;
}

/**
 * 计算配置完整度百分比
 * @returns 0-100的整数百分比
 */
export function calculateCompletionPercentage(node: FactoryNode): number {
  const [filledCount, totalCount] = calculateRequiredFieldCompletion(node);
  if (totalCount === 0) {
    return 100; // 无必填字段要求，视为100%完成
  }

  return Math.round((filledCount / totalCount) * 100);
}

/**
 * 获取节点缺失的必填字段列表
 * 用于在UI中提示用户需要填写哪些字段
 */
export function getMissingRequiredFields(node: FactoryNode): Array<{fieldPath: string, label: string, currentValue: any}> {
  const requiredFields = REQUIRED_FIELDS_BY_TYPE[node.type] || [];
  const missingFields: Array<{fieldPath: string, label: string, currentValue: any}> = [];

  requiredFields.forEach(field => {
    const value = getValueByPath(node, field.fieldPath);
    if (!isFieldFilled(value, field.validate)) {
      missingFields.push({
        fieldPath: field.fieldPath,
        label: field.label,
        currentValue: value
      });
    }
  });

  return missingFields;
}

/**
 * 检查节点是否已完全配置（所有必填字段已填写且无错误）
 */
export function isNodeFullyConfigured(node: FactoryNode): boolean {
  return calculateNodeStatus(node) === 'configured';
}

/**
 * 检查节点是否有配置错误
 */
export function hasConfigurationError(node: FactoryNode): boolean {
  return !!node.errorMessage;
}

/**
 * 递归更新整棵树中所有节点的状态
 * 注意：这会创建新的树对象，不会修改原树
 */
export function updateTreeStatuses(tree: FactoryNode): FactoryNode {
  // 计算当前节点的状态
  const currentStatus = calculateNodeStatus(tree);

  // 递归处理子节点
  const updatedChildren = tree.children?.map(updateTreeStatuses) || undefined;

  // 如果状态或子节点有变化，返回新对象
  if (currentStatus !== tree.status || updatedChildren !== tree.children) {
    return {
      ...tree,
      status: currentStatus,
      children: updatedChildren,
    };
  }

  return tree;
}

/**
 * 更新单个节点的状态（如果状态有变化）
 * @returns 新的树对象（如果状态有变化）或原树对象
 */
export function updateNodeStatusIfChanged(tree: FactoryNode, nodeId: string): FactoryNode {
  const node = findNodeById(tree, nodeId);
  if (!node) {
    return tree;
  }

  const newStatus = calculateNodeStatus(node);
  if (node.status === newStatus) {
    return tree; // 状态未变化
  }

  return updateNodeStatus(tree, nodeId, newStatus);
}

/**
 * 在树中查找节点（辅助函数）
 * 注意：这是一个简单实现，对于大型树可能效率不高
 */
function findNodeById(tree: FactoryNode, nodeId: string): FactoryNode | null {
  if (tree.id === nodeId) {
    return tree;
  }

  if (tree.children) {
    for (const child of tree.children) {
      const found = findNodeById(child, nodeId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

/**
 * 更新树中节点的状态（辅助函数）
 * 注意：这会创建新的树对象，不会修改原树
 */
function updateNodeStatus(tree: FactoryNode, nodeId: string, newStatus: NodeStatus): FactoryNode {
  if (tree.id === nodeId) {
    return { ...tree, status: newStatus };
  }

  if (!tree.children) {
    return tree;
  }

  const updatedChildren = tree.children.map(child =>
    updateNodeStatus(child, nodeId, newStatus)
  );

  return { ...tree, children: updatedChildren };
}