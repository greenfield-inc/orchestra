#!/usr/bin/env node
// Daily security-loop timer entry: launchd starts it through run-daemon.sh's env loader.
import { readFileSync } from "node:fs";
import { runSecurityLoop, type GraphQL } from "./security-loop.js";

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function localDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const graphqlUrl = process.env.LINEAR_GRAPHQL_URL?.trim() || "https://api.linear.app/graphql";

function linearGraphQL(apiKey: string): GraphQL {
  return async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json() as { data?: T; errors?: Array<{ message: string }> };
    if (!response.ok || payload.errors?.length || !payload.data)
      throw new Error(`Linear ${response.status}: ${payload.errors?.map(error => error.message).join("; ") ?? "no data"}`);
    return payload.data;
  };
}

try {
  const date = localDate();
  const result = await runSecurityLoop({
    graphql: linearGraphQL(env("LINEAR_API_KEY")),
    teamKey: env("SECURITY_LOOP_TEAM"),
    implementerActorId: env("IMPLEMENTER_APP_ACTOR_ID"),
    subscriberEmails: env("SECURITY_LOOP_SUBSCRIBERS").split(",").map(email => email.trim()).filter(Boolean),
    template: readFileSync(new URL("../ops/security-loop-issue.md", import.meta.url), "utf8"),
    date,
  });
  process.stdout.write(`${JSON.stringify({ event: "security_loop", date, ...result })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ event: "security_loop_failed", error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
}
