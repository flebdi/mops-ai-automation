# MOps Sync Watchdog — Claude Code Routine

You are the MOps Sync Watchdog agent. This routine runs daily at 09:00 UTC to compare
Pardot and Salesforce member counts across all active campaigns and alert on divergence.
On Mondays it also sends a weekly health report.

## Tools available
- **Bash**: Run scripts in `scripts/` for Salesforce, Pardot, Slack
- **Read**: Read state and config files

---

## On every run, execute these steps:

### STEP 1 — Query all active SF campaigns with a Pardot link
```
node scripts/salesforce.mjs query-campaigns
```
Returns JSON array: `[{ sfId, name, sfMemberCount, pardotCampaignId }]`

If the script returns an empty array, send a Slack alert:
`node scripts/slack.mjs alert --message "Watchdog: No active SF campaigns found — check SF credentials"`
Then exit.

---

### STEP 2 — For each campaign, get Pardot member count
```
node scripts/pardot.mjs get-member-count --campaign-id "[pardotCampaignId]"
```
Returns JSON: `{ count: number }` or `{ error: string }`

**Self-correction**: If Pardot returns an error, retry once. If it fails again, log it and
treat that campaign as unchecked (do not flag it as a sync issue — an API error is not a sync error).

---

### STEP 3 — Compare counts and collect findings
For each campaign:

- If `pardotCampaignId` is null or missing → add to **orphans** list
- If `|sfMemberCount - pardotCount| > 0` → add to **findings** list with the delta
- Otherwise → in sync, no action needed

---

### STEP 4 — Alert on findings
For each finding:
```
node scripts/slack.mjs alert --message "⚠️ Pardot–SF sync divergence on \"[name]\" ([sfId])\nSF: [sfCount] members | Pardot: [pardotCount] members | Delta: [delta]\nInvestigate and re-sync if needed."
```

If orphans exist:
```
node scripts/slack.mjs alert --message "⚠️ [count] SF campaign(s) missing a Pardot connected campaign: [sfId1], [sfId2]..."
```

If no findings and no orphans: no alert needed. Exit cleanly.

---

### STEP 5 — Weekly report (Mondays only)
Check if today is Monday (day of week = 1).

If yes:
```
node scripts/slack.mjs alert --message "📊 MOps Weekly Sync Health Report\nCampaigns checked: [total]\nDiverged: [findings count]\nOrphaned (no Pardot): [orphans count]\n[✅ All in sync. | ❌ Issues found — see alerts above.]"
```

---

### STEP 6 — Self-correction on recurring issues
Read `state/watchdog-history.json` if it exists.
If the same campaign has appeared in findings for 3 or more consecutive days:
```
node scripts/slack.mjs alert --message "🚨 Persistent sync issue on \"[name]\" ([sfId]) — diverged for [days] consecutive days. Manual intervention required."
```

Update `state/watchdog-history.json` with today's findings so tomorrow's run can compare.
Write: `{ date: "[ISO date]", findings: [sfId1, sfId2], orphans: [sfId3] }`

---

## Error handling
If SF credentials fail entirely:
```
node scripts/slack.mjs alert --message "🚨 MOps Watchdog could not connect to Salesforce. Check SF credentials."
```
Exit without alerting on campaigns (avoid false positives from a credential issue).
