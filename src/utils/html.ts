export const escapeHtml = (str: string): string =>
  str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * 只中和「可能开启 HTML 标签」的 `<`，其余字符原样保留。
 *
 * 颜文字/emoji 的 icon 会被使用方当 HTML 插入，但颜文字本身就大量使用
 * `"`、`'`、`<`、`>`、`&` 作为图案；完整 HTML 转义会把它们变成 `&quot;`、
 * `&lt;` 等实体，选中或复制后直接显示成实体文本（例如 `(>_<)` 变成
 * `(&gt;_&lt;)`）。这里只转义能形成标签的 `<`（后接字母、`!`、`?`，或
 * `/` + 字母），既保留颜文字原样，又能阻断 `<img>`、`<script>` 之类注入。
 */
export const escapeTagOpen = (str: string): string =>
  str.replace(/<(?=[a-zA-Z!?]|\/[a-zA-Z])/g, '&lt;');

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

