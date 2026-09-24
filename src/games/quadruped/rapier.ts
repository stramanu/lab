/**
 * One-time asynchronous initialisation of the physics engine: Rapier (dimforge, Apache-2.0),
 * pinned to its deterministic WebAssembly build. Environments are synchronous, so everything
 * that creates one (scripts, workers, the demo) awaits `initQuadrupedPhysics()` first.
 * The package is imported dynamically, so bundles that never create a quadruped do not load it.
 */
export type Rapier = typeof import('@dimforge/rapier3d-deterministic-compat').default;

let ready: Promise<Rapier> | null = null;
let loaded: Rapier | null = null;

export function initQuadrupedPhysics(): Promise<Rapier> {
  ready ??= import('@dimforge/rapier3d-deterministic-compat').then(async ({ default: R }) => {
    await R.init();
    return (loaded = R);
  });
  return ready;
}

/** The initialised engine; throws if `initQuadrupedPhysics()` has not completed. */
export function rapier(): Rapier {
  if (!loaded) throw new Error("Quadruped physics is not initialised: await initQuadrupedPhysics() (or the game definition's init()) first");
  return loaded;
}
