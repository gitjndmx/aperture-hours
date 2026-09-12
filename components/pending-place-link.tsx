"use client";

import Link from "next/link";
import { useState } from "react";

export function PendingPlaceLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [pending, setPending] = useState(false);
  return (
    <Link href={href} prefetch={false} className="place-result" aria-busy={pending || undefined} onClick={() => setPending(true)}>
      {children}
      {pending && <span className="place-pending" role="status">Reading forecast…</span>}
    </Link>
  );
}
