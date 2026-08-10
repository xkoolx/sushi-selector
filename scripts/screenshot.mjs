#!/usr/bin/env node
// Take screenshots of the app for the README.
// Requires wrangler dev running on localhost:8787.

import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE || "http://localhost:8787";
const SCREENSHOT_DIR = "docs/screenshots";

// Fixture menu data to seed localStorage so we can see results without API key.
const FIXTURE_MENU = {
  restaurant_name: "Sakura Sushi",
  sections: [{ name: "Specialty Rolls" }, { name: "Classic Rolls" }, { name: "Nigiri" }],
  items: [
    { id: "0:1", name: "Dragon Roll", section: "Specialty Rolls", price_text: "16.95", price: 16.95, ingredients: ["shrimp tempura", "avocado", "eel", "eel sauce", "sesame seed"], wrap: "nori", is_raw: false, notes: null, flagged: false },
    { id: "0:2", name: "Rainbow Roll", section: "Specialty Rolls", price_text: "18.95", price: 18.95, ingredients: ["imitation crab", "avocado", "cucumber", "tuna", "salmon", "yellowtail", "shrimp"], wrap: "nori", is_raw: true, notes: null, flagged: false },
    { id: "0:3", name: "Spicy Tuna Roll", section: "Specialty Rolls", price_text: "14.95", price: 14.95, ingredients: ["spicy tuna", "cucumber", "sriracha mayo"], wrap: "nori", is_raw: true, notes: null, flagged: false },
    { id: "0:4", name: "Philadelphia Roll", section: "Classic Rolls", price_text: "13.95", price: 13.95, ingredients: ["salmon", "cream cheese", "cucumber"], wrap: "nori", is_raw: true, notes: null, flagged: false },
    { id: "0:5", name: "California Roll", section: "Classic Rolls", price_text: "10.95", price: 10.95, ingredients: ["imitation crab", "avocado", "cucumber", "sesame seed"], wrap: "nori", is_raw: false, notes: null, flagged: false },
    { id: "0:6", name: "Volcano Roll", section: "Specialty Rolls", price_text: "17.95", price: 17.95, ingredients: ["imitation crab", "avocado", "spicy tuna", "eel sauce", "masago"], wrap: "nori", is_raw: true, notes: "baked top", flagged: false },
    { id: "0:7", name: "Salmon Nigiri", section: "Nigiri", price_text: "6.95", price: 6.95, ingredients: ["salmon", "rice"], wrap: "none", is_raw: true, notes: "2 pcs", flagged: false },
    { id: "0:8", name: "Tuna Nigiri", section: "Nigiri", price_text: "7.95", price: 7.95, ingredients: ["tuna", "rice"], wrap: "none", is_raw: true, notes: "2 pcs", flagged: false },
    { id: "0:9", name: "Shrimp Tempura Roll", section: "Classic Rolls", price_text: "12.95", price: 12.95, ingredients: ["shrimp tempura", "avocado", "cucumber", "eel sauce"], wrap: "nori", is_raw: false, notes: null, flagged: false },
    { id: "0:10", name: "Yellowtail Jalapeno Roll", section: "Specialty Rolls", price_text: "15.95", price: 15.95, ingredients: ["yellowtail", "jalapeno", "cilantro", "ponzu"], wrap: "soy_paper", is_raw: true, notes: null, flagged: false },
  ],
  parsedAt: Date.now(),
};

async function main() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // Screenshot 1: Home screen
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/home.png`,
    fullPage: false,
  });
  console.log("Captured: home.png");

  // Seed localStorage with fixture menu and a job pointing to it
  await page.evaluate((menu) => {
    localStorage.setItem("ss:menu:sakura-sushi", JSON.stringify(menu));
    const job = {
      state: "READY",
      jobHash: "fixture123",
      sessionToken: null,
      photos: null,
      photoStates: [],
      result: menu,
      error: null,
      updatedAt: Date.now(),
    };
    localStorage.setItem("ss:job:fixture123", JSON.stringify(job));
  }, FIXTURE_MENU);

  // Reload and see if there is a recent menu link
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // Click the saved menu in the recent list
  const recentItem = page.locator(".recent-item").first();
  if (await recentItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    await recentItem.click();
    await page.waitForTimeout(1000);
  }

  // Screenshot 2: Results screen
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/results.png`,
    fullPage: false,
  });
  console.log("Captured: results.png");

  await browser.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
