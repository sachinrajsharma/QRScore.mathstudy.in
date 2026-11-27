import type { Metadata } from "next";
import Link from "next/link";
import { supportUser } from "@/lib/support/page";
import { PortalPage } from "@/components/portal/shell";
import { Card } from "@/components/portal/shell";
import { CATEGORIES, LIMITS } from "@/lib/support/model";
import { listCategories } from "@/lib/support/store";
import { KNOWLEDGE_BASE } from "@/lib/support/kb";
import { ACCEPT } from "@/lib/support/attachments";
import { Flash } from "@/components/support/ui";
import { newTicketAction } from "../actions";
import { captchaMode, turnstileSiteKey } from "@/lib/portal/captcha";
import { TicketForm } from "@/components/support/ticket-form";

export const metadata: Metadata = { title: "Raise a support ticket | GrowQR" };
export const dynamic = "force-dynamic";

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await supportUser("/support/new");
  const sp = await searchParams;
  const mode = captchaMode();
  const captcha = { mode, siteKey: mode === "turnstile" ? turnstileSiteKey() : "" };
  const cats = (await listCategories(true).catch(() => [])).map((c) => ({ slug: c.slug, name: c.name }));
  const categories = cats.length ? cats : CATEGORIES.map((c) => ({ slug: c.id, name: c.label }));
  return (
    <PortalPage user={me} active="support" title="Raise a support ticket" subtitle="Tell us what is wrong or what you need. The team replies here and by email." wide>
      <Flash err={sp.e} />
      <Card>
        <TicketForm action={newTicketAction} captcha={captcha} categories={categories} kb={KNOWLEDGE_BASE} member={{ email: me.email }} accept={ACCEPT} limits={{ perHour: LIMITS.perHour, openAtOnce: LIMITS.openAtOnce }} />
        <p className="mt-4 text-[14.5px]"><Link href="/support/tickets" className="underline">My tickets</Link></p>
      </Card>
    </PortalPage>
  );
}
