#!/usr/bin/env node
// Airtable helper — audit logging and similar campaign lookup
// Usage:
//   node scripts/airtable.mjs log --task-id "..." --automation "..." --decision "..." --type "..." --region "..." --sf-campaign-id "..."
//   node scripts/airtable.mjs get-similar --limit 3

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = join(__dirname, "..", ".env");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const [key, ...rest] = line.split("=");
      if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
    }
  } catch {}
}
loadEnv();

const AIRTABLE_API_KEY      = process.env.AIRTABLE_API_KEY      ?? "";
const AIRTABLE_BASE_ID      = process.env.AIRTABLE_BASE_ID      ?? "";
const AIRTABLE_AUDIT_TABLE  = process.env.AIRTABLE_AUDIT_TABLE_ID ?? "";

const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_AUDIT_TABLE}`;

async function airtableRequest(method, path, body) {
  if (!AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY is not set");

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Airtable ${method} failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

async function logDecision(args) {
  const fields = {
    AsanaTaskId:   args["task-id"]        ?? "",
    Automation:    args["automation"]     ?? "",
    Decision:      args["decision"]       ?? "",
    Type:          args["type"]           ?? "",
    Region:        args["region"]         ?? "",
    SFCampaignId:  args["sf-campaign-id"] ?? "",
    Timestamp:     new Date().toISOString(),
  };

  await airtableRequest("POST", "", { records: [{ fields }] });
  return { ok: true };
}

async function getSimilar(args) {
  const limit = parseInt(args.limit ?? "3", 10);

  // Fetch recent completed records to use as few-shot examples
  const params = new URLSearchParams({
    maxRecords: String(limit),
    sort[0][field]: "Timestamp",
    sort[0][direction]: "desc",
    filterByFormula: `{Decision} = "completed"`,
  });

  const result = await airtableRequest("GET", `?${params}`);
  return (result.records ?? []).map(r => r.fields);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const [,, command, ...rest] = process.argv;
const args = parseArgs(rest);

try {
  let result;
  if (command === "log")             result = await logDecision(args);
  else if (command === "get-similar") result = await getSimilar(args);
  else throw new Error(`Unknown command: ${command}`);

  console.log(JSON.stringify(result));
  process.exit(0);
} catch (err) {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
}
