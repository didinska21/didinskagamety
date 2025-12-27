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

/* ================= PARSE PROXY ================= */
function parseProxy(proxy) {
  // Remove protocol
  const clean = proxy.replace(/^https?:\/\//, "").replace(/^socks5:\/\//, "");
  
  if (clean.includes("@")) {
    // Format: user:pass@host:port
    const [authPart, hostPart] = clean.split("@");
    const [username, password] = authPart.split(":");
    return { username, password, host: hostPart };
  } else {
    // Format: host:port (no auth)
    return { username: null, password: null, host: clean };
  }
}

/* ================= REGISTER FUNCTION ================= */
async function registerAccount(accountNum, proxy = null) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`🎯 AKUN #${accountNum}/${totalAccounts}`);
  if (proxy) console.log(`🔁 Proxy: ${proxy.substring(0, 40)}...`);
  console.log("=".repeat(50));

  let proxyConfig = null;
  if (proxy) {
    proxyConfig = parseProxy(proxy);
    console.log(`📡 Host: ${proxyConfig.host}`);
    if (proxyConfig.username) {
      console.log(`🔐 User: ${proxyConfig.username.substring(0, 20)}...`);
    }
  }

  const launchOptions = {
    headless: true,
    defaultViewport: { width: 1366, height: 768 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-blink-features=AutomationControlled"
    ],
    ignoreHTTPSErrors: true
  };

  // Set proxy server (host:port only, NO auth in args)
  if (proxyConfig) {
    launchOptions.args.push(`--proxy-server=http://${proxyConfig.host}`);
  }

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Set proxy authentication via page.authenticate()
    if (proxyConfig && proxyConfig.username && proxyConfig.password) {
      await page.authenticate({
        username: proxyConfig.username,
        password: proxyConfig.password
      });
      console.log("✅ Proxy authenticated");
    }

    // Set realistic headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });

    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("🌐 Loading page...");
    await page.goto("https://gamety.org/?pages=reg", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log("✅ Page loaded");

    // Wait for form
    console.log("⏳ Waiting for form...");
    await page.waitForSelector("#form", { visible: true, timeout: 60000 });
    await page.waitForFunction(() => {
      const f = document.querySelector("#form");
      return f && f.querySelector('input[name="login"]') && 
             f.querySelector('input[name="email"]') && 
             f.querySelector('input[name="pass"]') && 
             f.querySelector('input[name="cap"]');
    }, { timeout: 60000 });

    console.log("✅ Form ready");

    // Fill form
    const uid = Date.now() + Math.floor(Math.random() * 1000);
    const username = `user${uid}`;
    const email = `user${uid}@gmail.com`;
    const password = "Password123!";

    await page.type('#form input[name="login"]', username, { delay: 50 });
    await page.type('#form input[name="email"]', email, { delay: 50 });
    await page.type('#form input[name="pass"]', password, { delay: 50 });
    console.log(`✍️ Filled: ${username}`);

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
    console.log("📨 Submitting...");
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
      console.log("🚫 IP BLOCKED");
      return { success: false, reason: "ip_blocked" };
    } else if (/captcha|wrong code/i.test(bodyText)) {
      console.log("❌ CAPTCHA SALAH");
      return { success: false, reason: "wrong_captcha" };
    } else {
      console.log("⚠️ UNKNOWN RESPONSE");
      console.log("📄 Preview:", bodyText.substring(0, 200));
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
          results.failed--;
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
