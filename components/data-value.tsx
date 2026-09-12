import type { Provenance } from "@/lib/types";

export function DataValue({
  value,
  provenance,
  description,
  className = ""
}: {
  value: React.ReactNode;
  provenance: Provenance;
  description?: string;
  className?: string;
}) {
  return (
    <span className={`data-value ${className}`} aria-label={description}>
      <span className="data-reading">{value}</span>
      <span className="provenance">{provenance}</span>
    </span>
  );
}
