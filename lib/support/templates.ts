/** Reply templates: {name} and {order} are replaced; a missing order shows as "your request". */
export function renderTemplate(body: string, ctx: { name: string; order?: string | null }): string {
  const first = (ctx.name || "").trim().split(/\s+/)[0] || "there";
  const order = (ctx.order ?? "").trim() || "your request";
  return body.replace(/\{name\}/g, first).replace(/\{order\}/g, order);
}
