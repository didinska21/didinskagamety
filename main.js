import puppeteer from "puppeteer";
import Tesseract from "tesseract.js";
import sharp from "sharp";
import fs from "fs";
import readline from "readline-sync";

/* ================= CONFIG ================= */
console.log(`
==============================
 BULK AUTO REGISTER BOT
==============================
1. Tanpa Proxy (1x saja)
2. Proxy Rotating (Bulk)
==============================
`);

const choice = readline.question("Pilih mode (1/2): ");
let proxyList = [];
let totalAccounts = 1;

if (choice === "2") {
  if (!fs.existsSync("proxies.txt")) {
    console.log("❌ File proxies.txt tidak ditemukan");
    process.exit(1);
  }

  proxyList = fs.readFileSync("proxies.txt", "utf8")
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  if (!proxyList.length) {
    console.log("❌ proxies.txt kosong");
    process.exit(1);
  }

  console.log(`📋 Total proxy tersedia: ${proxyList.length}`);
  totalAccounts = parseInt(readline.question("Berapa akun yang mau dibuat? ")) || 1;
}

/* ================= OCR FUNCTION ================= */
async function recognizeCaptcha() {
  const configs = [
    { psm: 7, threshold: 128 },
    { psm: 8, threshold: 128 },
    { psm: 13, threshold: 100 },
    { psm: 6, threshold: 150 },
  ];

  for (const config of configs) {
    try {
      await sharp("captcha.png")
        .resize(400, 150, { fit: "inside" })
        .normalize()
        .grayscale()
        .threshold(config.threshold)
        .toFile("captcha_temp.png");

      const { data: { text } } = await Tesseract.recognize(
        "captcha_temp.png",
        "eng",
        { tessedit_char_whitelist: "0123456789", psm: config.psm }
      );

      const result = text.replace(/\D/g, "").trim();
      
      if (result.length === 4) {
        return result;
      }
    } catch (err) {
      // Silent fail, try next config
    }
  }
  return null;
}

/* ================= REGISTER FUNCTION ================= */
async function registerAccount(accountNum, proxy = null) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`🎯 AKUN #${accountNum}/${totalAccounts}`);
  if (proxy) console.log(`🔁 Proxy: ${proxy.substring(0, 30)}...`);
  console.log("=".repeat(50));

  const launchOptions = {
    headless: true,
    defaultViewport: { width: 1366, height: 768 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  };

  if (proxy) launchOptions.args.push(`--proxy-server=${proxy}`);

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Proxy auth
    if (proxy && proxy.includes("@")) {
      const auth = proxy.split("@")[0].replace(/^https?:\/\//, "");
      const [username, password] = auth.split(":");
      await page.authenticate({ username, password });
    }

    await page.goto("https://gamety.org/?pages=reg", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // Wait for form
    await page.waitForSelector("#form", { visible: true, timeout: 60000 });
    await page.waitForFunction(() => {
      const f = document.querySelector("#form");
      return f && f.querySelector('input[name="login"]') && 
             f.querySelector('input[name="email"]') && 
             f.querySelector('input[name="pass"]') && 
             f.querySelector('input[name="cap"]');
    }, { timeout: 60000 });

    // Fill form
    const uid = Date.now() + Math.floor(Math.random() * 1000);
    const username = `user${uid}`;
    const email = `user${uid}@gmail.com`;
    const password = "Password123!";

    await page.type('#form input[name="login"]', username, { delay: 50 });
    await page.type('#form input[name="email"]', email, { delay: 50 });
    await page.type('#form input[name="pass"]', password, { delay: 50 });

    // Captcha
    const capImg = await page.$("#cap_img");
    if (!capImg) {
      console.log("❌ CAPTCHA tidak ditemukan");
      await browser.close();
      return { success: false, reason: "no_captcha" };
    }

    await capImg.screenshot({ path: "captcha.png", type: "png" });
    const captcha = await recognizeCaptcha();

    if (!captcha || captcha.length !== 4) {
      console.log("❌ OCR gagal baca captcha");
      await browser.close();
      return { success: false, reason: "ocr_failed" };
    }

    console.log(`🔍 Captcha: ${captcha}`);
    await page.type('#form input[name="cap"]', captcha, { delay: 50 });

    // Submit
    await Promise.all([
      page.click('#form button[name="sub_reg"]'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 })
    ]);

    // Check result
    const bodyText = await page.evaluate(() => document.body.innerText);

    await browser.close();

    if (/success|successful|berhasil|congratulations/i.test(bodyText)) {
      console.log("✅ REGISTER SUCCESS!");
      
      // Save to file
      const data = `${username}:${email}:${password}\n`;
      fs.appendFileSync("accounts.txt", data);
      
      return { 
        success: true, 
        username, 
        email, 
        password 
      };
    } else if (/already.*registration.*ip|ip.*already/i.test(bodyText)) {
      console.log("🚫 IP BLOCKED - Need proxy");
      return { success: false, reason: "ip_blocked" };
    } else if (/captcha|wrong code/i.test(bodyText)) {
      console.log("❌ CAPTCHA SALAH - Retry...");
      return { success: false, reason: "wrong_captcha" };
    } else {
      console.log("⚠️ UNKNOWN RESPONSE");
      return { success: false, reason: "unknown" };
    }

  } catch (err) {
    console.log("❌ ERROR:", err.message);
    if (browser) await browser.close();
    return { success: false, reason: "error", error: err.message };
  }
}

/* ================= MAIN ================= */
(async () => {
  const results = {
    success: 0,
    failed: 0,
    accounts: []
  };

  for (let i = 1; i <= totalAccounts; i++) {
    let proxy = null;
    
    if (proxyList.length > 0) {
      proxy = proxyList[(i - 1) % proxyList.length];
    }

    const result = await registerAccount(i, proxy);

    if (result.success) {
      results.success++;
      results.accounts.push(result);
    } else {
      results.failed++;
      
      // Retry jika captcha salah (max 1x)
      if (result.reason === "wrong_captcha") {
        console.log("🔄 Retry 1x...");
        await new Promise(r => setTimeout(r, 2000));
        
        const retry = await registerAccount(i, proxy);
        if (retry.success) {
          results.success++;
          results.accounts.push(retry);
          results.failed--; // Cancel previous fail count
        }
      }
    }

    // Delay antar akun
    if (i < totalAccounts) {
      const delay = 3000 + Math.random() * 2000;
      console.log(`⏳ Delay ${(delay/1000).toFixed(1)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 SUMMARY");
  console.log("=".repeat(50));
  console.log(`✅ Success: ${results.success}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📁 Akun tersimpan di: accounts.txt`);
  console.log("=".repeat(50));

  // Cleanup
  try {
    if (fs.existsSync("captcha_temp.png")) fs.unlinkSync("captcha_temp.png");
  } catch (e) {}
})();
