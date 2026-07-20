import { Badge } from "@/components/ui/badge";

/**
 * Never hardcode the tax year in UI copy (docs/frontend.md #10) — always
 * read it from the data's own `taxYear` field so it advances automatically
 * when the annual data update lands.
 */
export function TaxYearBadge({ taxYear }: { taxYear: number }) {
  return <Badge variant="accent">Tax year {taxYear}</Badge>;
}
