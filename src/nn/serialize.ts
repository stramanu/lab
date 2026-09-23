import { Mlp, type MlpConfig } from './mlp';

export interface SerializedPolicy {
  format: 'systemone-mlp';
  version: 1;
  config: MlpConfig;
  calibrationT: number;
  /** Base64 of the parameters as little-endian float32. */
  weights: string;
  meta?: Record<string, unknown>;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function exportPolicy(net: Mlp, calibrationT: number, meta?: Record<string, unknown>): SerializedPolicy {
  const f32 = Float32Array.from(net.params);
  return {
    format: 'systemone-mlp',
    version: 1,
    config: net.config,
    calibrationT,
    weights: bytesToBase64(new Uint8Array(f32.buffer)),
    ...(meta ? { meta } : {}),
  };
}

export function importPolicy(data: SerializedPolicy): { net: Mlp; calibrationT: number; meta?: Record<string, unknown> } {
  if (data.format !== 'systemone-mlp' || data.version !== 1) throw new Error('Unsupported policy format');
  const net = new Mlp(data.config, 'f32');
  const bytes = base64ToBytes(data.weights);
  const weights = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  if (weights.length !== net.numParams) throw new Error(`Expected ${net.numParams} weights, got ${weights.length}`);
  net.params.set(weights);
  return { net, calibrationT: data.calibrationT, meta: data.meta };
}
