import { Pool } from "pg";
import { config } from "../utils/config.js";
import { drizzle } from "drizzle-orm/node-postgres";


const pool = new Pool({ connectionString: config.databaseUrl })

export const db = drizzle(pool)