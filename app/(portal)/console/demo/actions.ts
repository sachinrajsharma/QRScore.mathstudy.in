"use server";

import { redirect } from "next/navigation";
import { putSessionData } from "@/lib/portal/session";
import { createInvestorDemo, removeInvestorDemo } from "@/lib/demo/investor";
import { adminGate } from "../gate";

export async function createDemoAction(): Promise<void> {
  const me = await adminGate("/console/demo");
  if (me.is_demo) redirect("/demo-readonly");
  const r = await createInvestorDemo();
  await putSessionData({ console_flash: [r.ok ? "ok" : "err", r.ok ? "The demo student is ready. Details are below." : r.message], demo_steps: r.steps });
  redirect("/console/demo");
}

export async function removeDemoAction(): Promise<void> {
  const me = await adminGate("/console/demo");
  if (me.is_demo) redirect("/demo-readonly");
  let msg: [string, string];
  try { msg = ["ok", await removeInvestorDemo()]; } catch (e) { msg = ["err", e instanceof Error ? e.message : "Could not remove the demo."]; }
  await putSessionData({ console_flash: msg });
  redirect("/console/demo");
}
