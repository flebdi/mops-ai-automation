#!/usr/bin/env node
// Slack helper — sends alerts to the MOps channel
// Usage: node scripts/slack.mjs alert --message "text here"

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

const SLACK_BOT_TOKEN   = process.env.SLACK_BOT_TOKEN   ?? "";
const SLACK_ALERT_CHANNEL = process.env.SLACK_ALERT_CHANNEL ?? "";

async function sendAlert(message) {
  if (!SLACK_BOT_TOKEN)     throw new Error("SLACK_BOT_TOKEN is not set");
  if (!SLACK_ALERT_CHANNEL) throw new Error("SLACK_ALERT_CHANNEL is not set");

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: SLACK_ALERT_CHANNEL, text: message }),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(`Slack error: ${data.error}`);
  return { ok: true, ts: data.ts };
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
  if (command === "alert") result = await sendAlert(args.message ?? "");
  else throw new Error(`Unknown command: ${command}`);

  console.log(JSON.stringify(result));
  process.exit(0);
} catch (err) {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
}
