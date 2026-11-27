import data from "./knowledge-base.json";

/** The quick answers shown on the ticket form before a ticket is sent: the fastest support is the ticket that never needs to be opened. Edit knowledge-base.json; no code change needed. */
export interface KbEntry { cats: string[]; q: string; a: string }
export const KNOWLEDGE_BASE: KbEntry[] = (data as KbEntry[]).filter((e) => e && typeof e.q === "string" && typeof e.a === "string" && Array.isArray(e.cats));
