import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { JurisdictionSchema, type Jurisdiction } from "./schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// /data lives at the repo root, alongside /src — see docs/data.md.
const DATA_ROOT = path.join(__dirname, "..", "..", "data");

const JurisdictionRegistrySchema = z.array(JurisdictionSchema);

let registryCache: Map<string, Jurisdiction> | null = null;

function loadRegistry(): Map<string, Jurisdiction> {
  if (registryCache) return registryCache;

  const raw = readFileSync(path.join(DATA_ROOT, "jurisdictions.json"), "utf-8");
  const jurisdictions = JurisdictionRegistrySchema.parse(JSON.parse(raw));

  const byId = new Map<string, Jurisdiction>();
  for (const jurisdiction of jurisdictions) {
    if (byId.has(jurisdiction.id)) {
      throw new Error(`duplicate jurisdiction id in jurisdictions.json: ${jurisdiction.id}`);
    }
    byId.set(jurisdiction.id, jurisdiction);
  }
  for (const jurisdiction of jurisdictions) {
    if (jurisdiction.parentId !== null && !byId.has(jurisdiction.parentId)) {
      throw new Error(
        `jurisdiction "${jurisdiction.id}" references unknown parentId "${jurisdiction.parentId}"`,
      );
    }
  }

  registryCache = byId;
  return byId;
}

/** Clears the in-memory registry/snapshot caches. Test-only. */
export function _resetRegistryCache(): void {
  registryCache = null;
}

export function getJurisdiction(id: string): Jurisdiction | undefined {
  return loadRegistry().get(id);
}

export function getChildren(parentId: string | null): Jurisdiction[] {
  return [...loadRegistry().values()].filter((j) => j.parentId === parentId);
}

/** Ancestor chain from root to the given jurisdiction, inclusive — e.g. [US, US-CA]. */
export function getAncestors(id: string): Jurisdiction[] {
  const registry = loadRegistry();
  const chain: Jurisdiction[] = [];
  let current = registry.get(id);
  while (current) {
    chain.unshift(current);
    current = current.parentId ? registry.get(current.parentId) : undefined;
  }
  if (chain.length === 0) {
    throw new Error(`unknown jurisdiction id: ${id}`);
  }
  return chain;
}

export function listJurisdictions(): Jurisdiction[] {
  return [...loadRegistry().values()];
}

export { DATA_ROOT };
