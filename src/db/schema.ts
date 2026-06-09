import { pgTable, serial, text, boolean, integer } from "drizzle-orm/pg-core";

export const routes = pgTable("routes", {
    id:         serial("id").primaryKey(),
    path:       text("path").notNull().unique(),
    upstream:   text("upstream").notNull(),
    auth:       boolean("auth").notNull().default(true),
    roles:      text("roles").array().default([]),
    rateLimit:  integer("rate_limit"),
    enabled:    boolean("enabled").notNull().default(true),
})