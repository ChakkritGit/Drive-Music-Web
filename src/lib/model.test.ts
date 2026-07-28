import { describe, expect, it } from "vitest";
import { createDefaultModel, predict, trainStep, weightedRandomIndex, HIDDEN_SIZE } from "@/lib/model";
import { FEATURE_SIZE } from "@/lib/features";

function zeroFeatures(): number[] {
  return new Array(FEATURE_SIZE).fill(0);
}

function oneHotFeatures(index: number): number[] {
  const f = new Array(FEATURE_SIZE).fill(0);
  f[index] = 1;
  return f;
}

describe("createDefaultModel", () => {
  it("has the expected shape", () => {
    const model = createDefaultModel();
    expect(model.id).toBe("default");
    expect(model.w1).toHaveLength(HIDDEN_SIZE);
    expect(model.w1[0]).toHaveLength(FEATURE_SIZE);
    expect(model.b1).toHaveLength(HIDDEN_SIZE);
    expect(model.w2).toHaveLength(HIDDEN_SIZE);
    expect(model.b1.every((b) => b === 0)).toBe(true);
    expect(model.w2.every((w) => w === 0)).toBe(true);
    expect(model.b2).toBe(0);
    expect(model.trainingEvents).toBe(0);
  });

  it("randomizes the hidden layer so units aren't symmetric", () => {
    const model = createDefaultModel();
    const flatW1 = model.w1.flat();
    const distinctValues = new Set(flatW1);
    // With random init, it would be astronomically unlikely for every weight to collide.
    expect(distinctValues.size).toBeGreaterThan(1);
    expect(flatW1.every((w) => w >= -0.1 && w <= 0.1)).toBe(true);
  });
});

describe("predict", () => {
  it("always returns a probability in [0, 1]", () => {
    const model = createDefaultModel();
    for (let i = 0; i < FEATURE_SIZE; i++) {
      const p = predict(model, oneHotFeatures(i));
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("is exactly 0.5 for a fresh model (zero output layer) regardless of input", () => {
    const model = createDefaultModel();
    expect(predict(model, zeroFeatures())).toBeCloseTo(0.5, 10);
    expect(predict(model, oneHotFeatures(0))).toBeCloseTo(0.5, 10);
    expect(predict(model, oneHotFeatures(FEATURE_SIZE - 1))).toBeCloseTo(0.5, 10);
  });
});

describe("trainStep", () => {
  it("increments trainingEvents and never mutates the input model", () => {
    const model = createDefaultModel();
    const features = oneHotFeatures(3);
    const updated = trainStep(model, features, 1);
    expect(updated.trainingEvents).toBe(1);
    expect(model.trainingEvents).toBe(0); // original untouched
    expect(updated).not.toBe(model);
    expect(updated.w1).not.toBe(model.w1);
  });

  it("moves the prediction toward label 1 with repeated training", () => {
    let model = createDefaultModel();
    const features = oneHotFeatures(5);
    const before = predict(model, features);
    for (let i = 0; i < 200; i++) {
      model = trainStep(model, features, 1);
    }
    const after = predict(model, features);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(0.9);
  });

  it("moves the prediction toward label 0 with repeated training", () => {
    let model = createDefaultModel();
    const features = oneHotFeatures(7);
    for (let i = 0; i < 200; i++) {
      model = trainStep(model, features, 0);
    }
    const after = predict(model, features);
    expect(after).toBeLessThan(0.1);
  });

  it("learning one feature's association doesn't blow up predictions for an unrelated feature", () => {
    let model = createDefaultModel();
    const trained = oneHotFeatures(2);
    const untouched = oneHotFeatures(20);
    for (let i = 0; i < 200; i++) {
      model = trainStep(model, trained, 1);
    }
    const p = predict(model, untouched);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe("weightedRandomIndex", () => {
  it("returns 0 for an empty weights array", () => {
    expect(weightedRandomIndex([])).toBe(0);
  });

  it("always returns a valid index", () => {
    const weights = [0.9, 0.1, 0.5, 0.001, 0.3];
    for (let i = 0; i < 500; i++) {
      const idx = weightedRandomIndex(weights);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(weights.length);
    }
  });

  it("picks a heavily-weighted index far more often than a near-zero one", () => {
    const weights = [100, 0.001, 0.001];
    const counts = [0, 0, 0];
    const trials = 3000;
    for (let i = 0; i < trials; i++) {
      counts[weightedRandomIndex(weights)]++;
    }
    expect(counts[0] / trials).toBeGreaterThan(0.95);
  });

  it("distributes roughly proportionally to weight for equal weights", () => {
    const weights = [1, 1, 1, 1];
    const counts = [0, 0, 0, 0];
    const trials = 4000;
    for (let i = 0; i < trials; i++) {
      counts[weightedRandomIndex(weights)]++;
    }
    for (const c of counts) {
      expect(c / trials).toBeGreaterThan(0.15);
      expect(c / trials).toBeLessThan(0.35);
    }
  });
});
