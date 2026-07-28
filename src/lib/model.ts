import type { ListeningModel } from "@/types";
import { FEATURE_SIZE } from "@/lib/features";

export const HIDDEN_SIZE = 12;
const LEARNING_RATE = 0.05;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * A small 2-layer neural network (tanh hidden layer, sigmoid output) trained online via
 * backprop after every track. Small random hidden-layer init breaks symmetry between hidden
 * units — the output layer can safely start at zero.
 */
export function createDefaultModel(): ListeningModel {
  const w1: number[][] = [];
  for (let h = 0; h < HIDDEN_SIZE; h++) {
    const row: number[] = [];
    for (let i = 0; i < FEATURE_SIZE; i++) {
      row.push((Math.random() - 0.5) * 0.2);
    }
    w1.push(row);
  }

  return {
    id: "default",
    w1,
    b1: new Array(HIDDEN_SIZE).fill(0),
    w2: new Array(HIDDEN_SIZE).fill(0),
    b2: 0,
    trainingEvents: 0,
    updatedAt: Date.now(),
  };
}

interface ForwardPass {
  hidden: number[];
  output: number;
}

function forward(model: ListeningModel, features: number[]): ForwardPass {
  const hidden = model.w1.map((row, h) => {
    let sum = model.b1[h];
    for (let i = 0; i < features.length; i++) {
      sum += row[i] * features[i];
    }
    return Math.tanh(sum);
  });

  let outSum = model.b2;
  for (let h = 0; h < hidden.length; h++) {
    outSum += model.w2[h] * hidden[h];
  }

  return { hidden, output: sigmoid(outSum) };
}

/** Predicted "how much of this track you'll enjoy/listen to", in [0, 1]. */
export function predict(model: ListeningModel, features: number[]): number {
  return forward(model, features).output;
}

/** One online backprop step toward `label` (the fraction of the track actually played). */
export function trainStep(model: ListeningModel, features: number[], label: number): ListeningModel {
  const { hidden, output } = forward(model, features);
  const outputError = label - output;

  const w2 = model.w2.slice();
  const hiddenErrors = new Array(hidden.length).fill(0);
  for (let h = 0; h < hidden.length; h++) {
    // d(tanh)/dx = 1 - tanh(x)^2
    hiddenErrors[h] = outputError * model.w2[h] * (1 - hidden[h] * hidden[h]);
    w2[h] += LEARNING_RATE * outputError * hidden[h];
  }
  const b2 = model.b2 + LEARNING_RATE * outputError;

  const w1 = model.w1.map((row, h) => {
    const newRow = row.slice();
    for (let i = 0; i < features.length; i++) {
      newRow[i] += LEARNING_RATE * hiddenErrors[h] * features[i];
    }
    return newRow;
  });
  const b1 = model.b1.map((b, h) => b + LEARNING_RATE * hiddenErrors[h]);

  return {
    ...model,
    w1,
    b1,
    w2,
    b2,
    trainingEvents: model.trainingEvents + 1,
    updatedAt: Date.now(),
  };
}

/** Weighted random pick — index i is chosen with probability proportional to weights[i] (floored so a zero-weight track is never impossible, just unlikely). Every random pick in this app's shuffle/recommendation paths goes through this — none of them fall back to a plain uniform pick. */
export function weightedRandomIndex(weights: number[]): number {
  if (weights.length === 0) return 0;
  const floored = weights.map((w) => Math.max(w, 0.001));
  const total = floored.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < floored.length; i++) {
    r -= floored[i];
    if (r <= 0) return i;
  }
  return floored.length - 1;
}
