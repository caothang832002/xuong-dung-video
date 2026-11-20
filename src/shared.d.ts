declare module '*/shared/sfx-synth.mjs' {
  export const SFX_NAMES: string[];
  export const synthSfx: (name: string) => { bytes: Uint8Array<ArrayBuffer>; dur: number };
}
declare module '*/shared/demo.mjs' {
  export const demoProject: (name: string) => unknown;
}
