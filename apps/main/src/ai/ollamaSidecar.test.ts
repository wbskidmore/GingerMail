// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CURATED_MODELS } from './curatedModels.js';

describe('Curated model registry', () => {
  it('has at least one starter and one recommended', () => {
    expect(CURATED_MODELS.some((m) => m.starter)).toBe(true);
    expect(CURATED_MODELS.some((m) => m.recommended)).toBe(true);
  });

  it('every model has a valid id and non-empty description', () => {
    for (const m of CURATED_MODELS) {
      expect(m.id).toMatch(/^[a-z0-9.]+:[a-z0-9.]+$/i);
      expect(m.displayName.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.sizeGB).toBeGreaterThan(0);
      expect(m.ramGB).toBeGreaterThan(0);
    }
  });

  it('keeps the list short to avoid choice paralysis', () => {
    // Picked at ~5 to match the UX research. If we add a sixth, force a
    // conversation about it rather than silently expanding the wizard.
    expect(CURATED_MODELS.length).toBeLessThanOrEqual(6);
  });

  it('orders models from small to large so the wizard reads top-down', () => {
    for (let i = 1; i < CURATED_MODELS.length; i += 1) {
      expect(CURATED_MODELS[i].sizeGB).toBeGreaterThanOrEqual(CURATED_MODELS[i - 1].sizeGB);
    }
  });
});
