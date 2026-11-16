declare module 'snarkjs' {
  export const groth16: {
    fullProve(
      input: Record<string, string>,
      wasm: string,
      zkey: string,
      logger?: unknown,
      options?: { memorySize?: number },
      runtimeOptions?: { singleThread?: boolean },
    ): Promise<{ proof: import('./kurier.js').Groth16Proof; publicSignals: string[] }>;
    verify(key: unknown, signals: string[], proof: import('./kurier.js').Groth16Proof): Promise<boolean>;
  };
}
