import postgres from "postgres";
export declare function getDb(): import("drizzle-orm/postgres-js").PostgresJsDatabase<Record<string, unknown>> & {
    $client: postgres.Sql<{}>;
};
export declare const db: import("drizzle-orm/postgres-js").PostgresJsDatabase<Record<string, unknown>> & {
    $client: postgres.Sql<{}>;
};
export * from "./schema.js";
//# sourceMappingURL=index.d.ts.map