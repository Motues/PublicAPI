export const escapeHtml = (str: string): string =>
  str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * 把值序列化为可安全嵌入 `<script>` 的 JSON。
 *
 * `JSON.stringify` 不会转义 `</script>`、`<!--` 等序列，直接拼进内联脚本
 * 会让配置内容（站点描述、表情数据等）变成可执行的 HTML。这里把 HTML
 * 敏感字符和 JS 行分隔符统一转成 `\uXXXX`，输出仍是合法 JSON。
 */
export const jsonForScript = (value: unknown): string => {
  const json = JSON.stringify(value);
  if (json === undefined) {
    return 'null';
  }

  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
};

