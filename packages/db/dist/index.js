import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
let _db = null;
export function getDb() {
    if (!_db) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error("DATABASE_URL environment variable is not set");
        }
        const client = postgres(connectionString);
        _db = drizzle(client, { schema });
    }
    return _db;
}
// Proxy that lazily initializes on first property access
export const db = new Proxy({}, {
    get(_target, prop, receiver) {
        return Reflect.get(getDb(), prop, receiver);
    },
});
export * from "./schema.js";
//# sourceMappingURL=index.js.map