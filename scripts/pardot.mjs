#!/usr/bin/env node
// Pardot / Account Engagement API helper
// Usage: node scripts/pardot.mjs <command> [--flag value ...]
// Commands: create-campaign, get-member-count

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

const SF_INSTANCE_URL   = process.env.SF_INSTANCE_URL   ?? "https://login.salesforce.com";
const SF_CLIENT_ID      = process.env.SF_CLIENT_ID      ?? "";
const SF_CLIENT_SECRET  = process.env.SF_CLIENT_SECRET  ?? "";
const SF_USERNAME       = process.env.SF_USERNAME       ?? "";
const SF_PASSWORD       = process.env.SF_PASSWORD       ?? "";
const SF_SECURITY_TOKEN = process.env.SF_SECURITY_TOKEN ?? "";
const BUSINESS_UNIT_ID  = process.env.PARDOT_BUSINESS_UNIT_ID ?? "TODO_PARDOT_BUSINESS_UNIT_ID";

let _token = null;

async function getToken() {
  if (_token) return _token;

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
    username: SF_USERNAME,
    password: SF_PASSWORD + SF_SECURITY_TOKEN,
  });

  const res = await fetch(`${SF_INSTANCE_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`SF auth for Pardot failed: ${await res.text()}`);
  const data = await res.json();
  _token = data.access_token;
  return _token;
}

async function pardotRequest(method, path, body) {
  const token = await getToken();
  const res = await fetch(`https://pi.pardot.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Pardot-Business-Unit-Id": BUSINESS_UNIT_ID,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Pardot ${method} ${path} failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

async function createCampaign(args) {
  const { "sf-campaign-id": sfCampaignId, name } = args;

  const result = await pardotRequest("POST", "/api/v5/objects/campaigns", {
    name,
    salesforceCampaignId: sfCampaignId,
  });

  return { pardotCampaignId: result.id ?? result.data?.id };
}

async function getMemberCount(args) {
  const { "campaign-id": campaignId } = args;

  // TODO(ground-truth): confirm the correct Pardot v5 endpoint and field name for member/prospect count
  const result = await pardotRequest("GET", `/api/v5/objects/campaigns/${campaignId}`);
  const count = result.totalProspects ?? result.data?.totalProspects ?? 0;
  return { count };
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
  if (command === "create-campaign")    result = await createCampaign(args);
  else if (command === "get-member-count") result = await getMemberCount(args);
  else throw new Error(`Unknown command: ${command}`);

  console.log(JSON.stringify(result));
  process.exit(0);
} catch (err) {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
}
