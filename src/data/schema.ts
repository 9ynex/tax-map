import { z } from "zod";

/**
 * Runtime schema + inferred types for the data model described in docs/data.md.
 * Zod is the source of truth here (not hand-written interfaces) so every JSON
 * file under /data is validated against the same shape the app compiles against —
 * this is the guardrail the annual data-update PRs (docs/deployment.md) rely on.
 */

export const CountryCodeSchema = z.enum(["US", "CA"]);
export type CountryCode = z.infer<typeof CountryCodeSchema>;

export const JurisdictionLevelSchema = z.enum([
  "country",
  "state",
  "province",
  "territory",
  "municipality",
]);
export type JurisdictionLevel = z.infer<typeof JurisdictionLevelSchema>;

export const JurisdictionSchema = z.object({
  id: z.string().min(1), // globally unique, e.g. "us-ca"
  slug: z.string().min(1), // single path segment relative to its parent, e.g. "ca"
  name: z.string().min(1),
  level: JurisdictionLevelSchema,
  parentId: z.string().nullable(),
  countryCode: CountryCodeSchema,
});
export type Jurisdiction = z.infer<typeof JurisdictionSchema>;

export const FilingStatusSchema = z.enum([
  "single",
  "marriedFilingJointly",
  "marriedFilingSeparately",
  "headOfHousehold",
]);
export type FilingStatus = z.infer<typeof FilingStatusSchema>;

export const TaxBracketSchema = z
  .object({
    min: z.number().nonnegative(),
    max: z.number().positive().nullable(), // null = top bracket, no upper bound
    rate: z.number().min(0).max(1),
  })
  .refine((b) => b.max === null || b.max > b.min, {
    message: "bracket max must be greater than min",
  });
export type TaxBracket = z.infer<typeof TaxBracketSchema>;

const BracketSetSchema = z.array(TaxBracketSchema).min(1);

// Some jurisdictions (US) key brackets by filing status; others (Canada, federally)
// have none. See docs/data.md — filing status is jurisdiction-conditional, not universal.
const BracketsSchema = z.union([
  BracketSetSchema,
  z.record(FilingStatusSchema, BracketSetSchema),
]);

export const DeductionOrCreditKindSchema = z.enum(["deduction", "credit"]);
export type DeductionOrCreditKind = z.infer<typeof DeductionOrCreditKindSchema>;

// Deductions reduce taxable income before brackets apply; credits reduce tax owed
// directly. Amount may be a flat number or vary by filing status, same as brackets
// (e.g. the US standard deduction is $15,000 single / $30,000 MFJ, not one number).
const FilingStatusAmountSchema = z.union([
  z.number(),
  z.record(FilingStatusSchema, z.number()),
]);

export const DeductionOrCreditSchema = z.object({
  name: z.string().min(1),
  kind: DeductionOrCreditKindSchema,
  amount: FilingStatusAmountSchema,
  phaseOut: z.object({ start: z.number(), end: z.number() }).optional(),
});
export type DeductionOrCredit = z.infer<typeof DeductionOrCreditSchema>;

export const TaxComponentTypeSchema = z.enum([
  "income",
  "payroll",
  "consumption",
  "property",
]);
export type TaxComponentType = z.infer<typeof TaxComponentTypeSchema>;

export const PrecisionSchema = z.enum(["statutory", "estimated"]);
export type Precision = z.infer<typeof PrecisionSchema>;

export const TaxComponentSchema = z
  .object({
    // Human-readable identifier, unique within a single snapshot's component
    // list — e.g. "CPP", "CPP2", "EI", "GST". Doubles as a future UI label
    // and as the join key `supersedesParent` uses to target one specific
    // ancestor component rather than every component of the same `type`
    // (multiple payroll components, e.g. CPP/CPP2/EI, can coexist on one
    // jurisdiction, so `type` alone isn't precise enough to supersede by).
    name: z.string().min(1),
    type: TaxComponentTypeSchema,
    brackets: BracketsSchema.optional(),
    flatRate: z.number().min(0).max(1).optional(),
    // For flatRate components applied to a bounded range rather than all
    // income (e.g. CPP2 applies only between the YMPE and YAMPE, or the US
    // Additional Medicare Tax's 0.9% above a threshold that itself varies by
    // filing status — $200k single/HoH, $250k MFJ, $125k MFS) — the taxable
    // base is max(0, min(income, cap) - floor). Same flat-or-keyed shape as
    // deduction/credit `amount` below. Defaults to 0.
    floor: FilingStatusAmountSchema.optional(),
    cap: z.number().nonnegative().optional(),
    deductionsCredits: z.array(DeductionOrCreditSchema).optional(),
    // Name of a same-`type` ancestor-jurisdiction component this one legally
    // replaces (not stacks with) — e.g. Quebec's own EI component
    // supersedesParent: "EI" to override the federal EI rate/cap without
    // touching the federal CPP/CPP2 components also of type "payroll". A
    // province's HST similarly supersedes the federal "GST" consumption
    // component, whereas genuinely-stacking taxes (PST/QST/RST) leave this
    // unset. See docs/data.md's HST/GST note.
    supersedesParent: z.string().min(1).optional(),
    // A proportional rebate on an already-computed same-`type` ancestor
    // component's dollar amount — e.g. the Quebec Abatement reduces the
    // federal "Federal income tax" component by 16.5% of what it computed
    // to, rather than replacing it (supersedesParent) or adding its own
    // bracket/flatRate math. Renders as amount = -(rate * target's computed
    // amount), so it must be processed after its target — true for any
    // cross-jurisdiction reference, since ancestors are always computed
    // first — see docs/data.md's Quebec Abatement note.
    abatement: z
      .object({
        targetName: z.string().min(1),
        rate: z.number().min(0).max(1),
      })
      .optional(),
    // A progressive surtax on an already-computed same-`type` component's
    // dollar amount — e.g. Ontario's surtax adds 20% of Ontario income tax
    // payable over $5,818, plus a further 36% over $7,446 (56% combined
    // above the higher threshold). Unlike `abatement` (a single flat rate),
    // this needs bracket-style tiering, so it reuses `BracketSetSchema`
    // applied to the target's computed `amount` instead of to income —
    // see docs/data.md's Ontario surtax note. Renders as a new positive
    // component (tax owed increases), the mirror image of `abatement`.
    surtax: z
      .object({
        targetName: z.string().min(1),
        brackets: BracketSetSchema,
      })
      .optional(),
    currency: z.string().length(3), // ISO 4217, e.g. "USD"
    effectiveDate: z.string().date(),
    taxYear: z.number().int().min(2000).max(2100),
    indexedToInflation: z.boolean(),
    precision: PrecisionSchema,
    sourceUrl: z.string().url().optional(),
  })
  .refine(
    (c) =>
      c.brackets !== undefined ||
      c.flatRate !== undefined ||
      c.abatement !== undefined ||
      c.surtax !== undefined,
    { message: "a TaxComponent must define brackets, a flatRate, an abatement, or a surtax" },
  );
export type TaxComponent = z.infer<typeof TaxComponentSchema>;

export const TaxYearSnapshotSchema = z.object({
  jurisdictionId: z.string().min(1),
  taxYear: z.number().int().min(2000).max(2100),
  components: z.array(TaxComponentSchema).min(1),
});
export type TaxYearSnapshot = z.infer<typeof TaxYearSnapshotSchema>;
