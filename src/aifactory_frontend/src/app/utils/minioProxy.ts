/**
 * 把后端返回的资产/缩略图 URL 归一化为可由前端 /static 代理加载的路径。
 *
 * 本地化后：MinIO 已移除，文件由 aifactory_backend 经 /static 挂载提供。
 * 后端 build_full_url/generate_presigned_url 直接返回 "/static/..."。
 * 本函数容错处理三种历史/当前形态：
 *   - 已是 /static/... 或其它相对路径  → 原样返回
 *   - 旧的 http(s)://host/{path} 全 URL → 转为 "/static/{path}"
 *   - 裸 object_name（如 "thumbnails/x.png"）→ 补成 "/static/thumbnails/x.png"
 *
 * @example
 *   proxyMinioUrl("/static/thumbnails/p9.png")              → "/static/thumbnails/p9.png"
 *   proxyMinioUrl("https://192.168.40.127:9000/ov-usd-bucket/thumbnails/p9.png")
 *                                                            → "/static/ov-usd-bucket/thumbnails/p9.png"
 *   proxyMinioUrl("thumbnails/p9.png")                       → "/static/thumbnails/p9.png"
 *   proxyMinioUrl(null) → ""
 */
export function proxyMinioUrl(url: string | null | undefined): string {
  if (!url) return "";
  // 已是相对路径（含 /static/…）直接用
  if (url.startsWith("/")) return url;
  // 旧的完整 URL：剥掉协议+主机，挂到 /static
  const match = url.match(/^https?:\/\/[^/]+\/(.+)$/);
  if (match) {
    return `/static/${match[1]}`;
  }
  // 裸 object_name → 补 /static 前缀
  return `/static/${url}`;
}
