"use client";

/** Fills the reply box with a canned reply (already personalised on the server). The staff member can edit it before sending. */
export function TemplatePicker({ templates, targetId, className }: { templates: Array<{ id: number; title: string; text: string }>; targetId: string; className: string }) {
  if (!templates.length) return null;
  return (
    <label className="flex items-center gap-2 text-[14px]">Use a template
      <select defaultValue="" className={className} aria-label="Reply template" onChange={(e) => {
        const t = templates.find((x) => String(x.id) === e.target.value);
        const box = document.getElementById(targetId) as HTMLTextAreaElement | null;
        if (t && box) { box.value = t.text; box.focus(); }
        e.target.value = "";
      }}>
        <option value="">Choose…</option>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
      </select>
    </label>
  );
}
