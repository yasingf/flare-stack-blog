// The parts of `bun:sqlite` that scripts use. The project does not load Bun's
// typings, which would add Bun globals to the Worker code.
declare module "bun:sqlite" {
  export class Database {
    constructor(filename: string, options?: { readonly?: boolean });
    query<Row = unknown, Bindings extends Array<unknown> = Array<unknown>>(
      sql: string,
    ): {
      get(...params: Bindings): Row | null;
      all(...params: Bindings): Array<Row>;
    };
    run(sql: string, params?: Array<unknown>): { changes: number };
    transaction(fn: () => void): () => void;
    close(): void;
  }
}
