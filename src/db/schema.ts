import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const routes = pgTable("routes", {
    id:         serial("id").primaryKey(),
    path:       text("path").notNull().unique(),
    upstream:   text("upstream").notNull(),
    auth:       boolean("auth").notNull().default(true),
    authType:   text("auth_type").notNull().default("jwt"),
    roles:      text("roles").array().default([]),
    rateLimit:  integer("rate_limit"),
    enabled:    boolean("enabled").notNull().default(true),
})

export const apiKeys = pgTable("api_keys", {
    id:        serial("id").primaryKey(),
    key:       text("key").notNull().unique(),
    owner:     text("owner").notNull(),         // service name e.g. "billing-service"
    role:      text("role").notNull().default("service"),
    enabled:   boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
})