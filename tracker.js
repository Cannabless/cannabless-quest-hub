// ===============================
// CannaBless Holder Tracker
// Runs daily via GitHub Actions
// ===============================

import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

// 🔧 CONFIG — EDIT THESE
const HELIUS_API_KEY = "e0547ccd-5242-4f1a-a644-247365aa0ec5";
const TOKEN_MINT = "GMS1792seBPDj78Yuhn9DepF3CaW7aAv72T6etwXmoon";

// Supabase (already filled for you)
const SUPABASE_URL = "https://ofstciqggeuuzrmqhdhi.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mc3RjaXFnZ2V1dXpybXFoZGhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMDA5ODQsImV4cCI6MjA4MzU3Njk4NH0.46YabyO64KLJmV83SIUV6k6aPxV4kBXAWJOfMKzQIME";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Tier rules
function calculateTier(days) {
  if (days >= 180) return { tier: "Evergreen", weight: 50 };
  if (days >= 90) return { tier: "Rooted", weight: 25 };
  if (days >= 30) return { tier: "Sprout", weight: 10 };
  return { tier: "Seed", weight: 0 };
}

async function getHolders() {
  const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
  const body = {
    jsonrpc: "2.0",
    id: "1",
    method: "getTokenAccounts",
    params: {
      mint: TOKEN_MINT,
      limit: 1000
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  return json.result.token_accounts || [];
}

async function run() {
  console.log("🌱 Starting CannaBless tracker…");

  const holders = await getHolders();

  for (const h of holders) {
    const wallet = h.owner;
    const balance = Number(h.amount);

    const { data: existing } = await supabase
      .from("wallets")
      .select("*")
      .eq("wallet_address", wallet)
      .single();

    if (!existing) {
      await supabase.from("wallets").insert({
        wallet_address: wallet,
        current_balance: balance,
        last_balance: balance,
        hold_days: 1
      });
      continue;
    }

    let holdDays = existing.hold_days;
    let lastSell = existing.last_sell;

    if (balance < existing.current_balance) {
      // SELL DETECTED
      holdDays = 0;
      lastSell = new Date().toISOString();
    } else if (balance > 0) {
      holdDays += 1;
    }

    const tierData = calculateTier(holdDays);

    if (tierData.tier !== existing.tier) {
      await supabase.from("tier_history").insert({
        wallet_address: wallet,
        old_tier: existing.tier,
        new_tier: tierData.tier
      });
    }

    await supabase.from("wallets").update({
      last_balance: existing.current_balance,
      current_balance: balance,
      hold_days: holdDays,
      tier: tierData.tier,
      reward_weight: tierData.weight,
      last_sell: lastSell,
      last_checked: new Date().toISOString()
    }).eq("wallet_address", wallet);
  }

  console.log("✅ Tracker run complete");
}

run().catch(console.error);
