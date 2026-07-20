/**
 * Standing disclaimer on every page from day one (docs/deployment.md:
 * "Standing item: disclaimer") — baked into the template, not retrofitted.
 */
export function Disclaimer() {
  return (
    <p className="text-xs leading-relaxed text-muted">
      Estimates only, not tax advice. Figures are calculated from published
      brackets and rates and may not reflect every deduction, credit, or
      local rule that applies to your situation. Consult a qualified tax
      professional before making financial decisions.
    </p>
  );
}
