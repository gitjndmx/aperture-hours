import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deletionCookieName } from "@/lib/cookies";
import { getPlanStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DeletePlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{32}$/.test(id)) notFound();
  const store = getPlanStore();
  const plan = store ? await store.get(id) : null;
  if (!plan) notFound();
  const secret = (await cookies()).get(deletionCookieName(id))?.value;
  return (
    <article className="route-shell delete-page">
      <p className="eyebrow">Permanent action</p>
      {secret ? <>
        <h1 tabIndex={-1} autoFocus>Delete this plan permanently?</h1>
        <p className="lede">The link will stop working immediately for everyone who has it. This cannot be undone and the plan cannot be restored.</p>
        <form action={`/plans/${id}/delete/action`} method="post" className="delete-actions">
          <button className="primary-button destructive" type="submit">Delete permanently</button>
          <Link className="secondary-button" href={`/plans/${id}`}>Keep the plan</Link>
        </form>
      </> : <>
        <h1>Deletion authority is not present.</h1>
        <p>This browser does not hold the deletion secret for this plan. The secret is shown once and kept only in the browser that created the plan — the server stores only a hash, so it cannot be recovered or re-sent. This plan becomes unavailable after 30 days and is removed by the next daily cleanup.</p>
        <Link className="primary-button" href={`/plans/${id}`}>Return to the saved plan</Link>
      </>}
    </article>
  );
}
