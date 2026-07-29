declare module "node:sqlite" {
  export type StatementResult = {
    changes: number;
    lastInsertRowid: number | bigint;
  };

  export class StatementSync {
    all(...values: unknown[]): Record<string, unknown>[];
    get(...values: unknown[]): Record<string, unknown> | undefined;
    run(...values: unknown[]): StatementResult;
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
