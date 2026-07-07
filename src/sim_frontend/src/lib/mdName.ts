/** 主数据双语显示名。
 *
 * 主数据表的英文原名保留在 *_name 列（operation_name / line_name / stage_name），
 * 中文放独立 *_cn 列（operation_name_cn / line_name_cn / stage_name_cn）。
 * 界面语言（i18n zh/en）决定优先取哪列，缺失时回退另一列——切语言后主数据名跟着切。
 *
 * 注意：树/2D 拓扑的标签在数据拉取时烘焙，切语言后需刷新或重进页面才会重取。
 */
import i18n from '@/i18n';

export function mdName(en?: string | null, cn?: string | null): string {
  const zh = (i18n.language ?? 'zh').startsWith('zh');
  return (zh ? cn || en : en || cn) || '';
}
