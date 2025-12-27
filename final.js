import puppeteer from "puppeteer";
import Tesseract from "tesseract.js";
import sharp from "sharp";
import fs from "fs";
import readline from "readline-sync";
import fetch from "node-fetch";

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

// 2Captcha Config (optional)
const USE_2CAPTCHA = readline.question("Gunakan 2Captcha API? (y/n): ").toLowerCase() === 'y';
let CAPTCHA_API_KEY = null;

if (USE_2CAPTCHA) {
  CAPTCHA_API_KEY = readline.question("Masukkan 2Captcha API Key: ").trim();
  if (!CAPTCHA_API_KEY) {
    console.log("❌ API Key tidak boleh kosong");
    process.exit(1);
  }
}

/* ================= IMPROVED OCR ================= */
async function recognizeCaptcha() {
  console.log("🔍 OCR Method 1: Enhanced preprocessing...");
  
  // Try multiple preprocessing strategies
  const strategies = [
    { name: "High Contrast", resize: 500, contrast: 2.0, threshold: 130 },
    { name: "Sharp + Denoise", resize: 450, contrast: 1.8, threshold: 120 },
    { name: "Normalized", resize: 400, contrast: 1.5, threshold: 140 },
    { name: "Inverted", resize: 400, contrast: 1.5, threshold: 140, invert: true }
  ];

  for (const strategy of strategies) {
    try {
      let pipeline = sharp("captcha.png")
        .resize(strategy.resize, Math.floor(strategy.resize * 0.375), { 
          fit: "inside", 
          kernel: "lanczos3" 
        })
        .normalize()
        .grayscale();

      // Apply contrast
      if (strategy.contrast > 1) {
        const factor = strategy.contrast;
        pipeline = pipeline.linear(factor, -(128 * factor) + 128);
      }

      // Denoise
      pipeline = pipeline.median(2);

      // Invert if needed (for white text on dark bg)
      if (strategy.invert) {
        pipeline = pipeline.negate();
      }

      // Threshold
      pipeline = pipeline.threshold(strategy.threshold);

      await pipeline.toFile("captcha_temp.png");

      // Try different PSM modes
      for (const psm of [7, 8, 13]) {
        const { data: { text } } = await Tesseract.recognize(
          "captcha_temp.png",
          "eng",
          {
            tessedit_char_whitelist: "0123456789",
            psm: psm,
            tessedit_pageseg_mode: psm
          }
        );

        const result = text.replace(/\D/g, "").trim();
        
        if (result.length === 4) {
          console.log(`✅ OCR Success [${strategy.name}, PSM${psm}]: ${result}`);
          return result;
        } else if (result.length > 0) {
          console.log(`⚠️ Partial [${strategy.name}, PSM${psm}]: "${result}"`);
        }
      }
    } catch (err) {
      // Continue to next strategy
    }
  }

  return null;
}

/* ================= 2CAPTCHA SOLVER ================= */
async function solve2Captcha() {
  if (!CAPTCHA_API_KEY) return null;

  console.log("🤖 Using 2Captcha API...");

  try {
    // Read image as base64
    const imageBuffer = fs.readFileSync("captcha.png");
    const base64Image = imageBuffer.toString("base64");

    // Submit captcha
    const submitUrl = `http://2captcha.com/in.php?key=${CAPTCHA_API_KEY}&method=base64&body=${base64Image}&numeric=1&min_len=4&max_len=4`;
    const submitRes = await fetch(submitUrl);
    const submitText = await submitRes.text();

    if (!submitText.startsWith("OK|")) {
      console.log("❌ 2Captcha submit failed:", submitText);
      return null;
    }

    const captchaId = submitText.split("|")[1];
    console.log(`⏳ Captcha ID: ${captchaId}, waiting for solve...`);

    // Poll for result (max 60s)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));

      const resultUrl = `http://2captcha.com/res.php?key=${CAPTCHA_API_KEY}&action=get&id=${captchaId}`;
      const resultRes = await fetch(resultUrl);
      const resultText = await resultRes.text();

      if (resultText.startsWith("OK|")) {
        const answer = resultText.split("|")[1];
        console.log(`✅ 2Captcha solved: ${answer}`);
        return answer;
      } else if (resultText !== "CAPCHA_NOT_READY") {
        console.log("❌ 2Captcha error:", resultText);
        return null;
      }
    }

    console.log("⏱️ 2Captcha timeout");
    return null;

  } catch (err) {
    console.log("❌ 2Captcha error:", err.message);
    return null;
  }
}

/* ================= PARSE PROXY ================= */
function parseProxy(proxy) {
  const clean = proxy.replace(/^https?:\/\//, "").replace(/^socks5:\/\//, "");
  
  if (clean.includes("@")) {
    const [authPart, hostPart] = clean.split("@");
    const [username, password] = authPart.split(":");
    return { username, password, host: hostPart };
  } else {
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

  if (proxyConfig) {
    launchOptions.args.push(`--proxy-server=http://${proxyConfig.host}`);
  }

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    if (proxyConfig && proxyConfig.username && proxyConfig.password) {
      await page.authenticate({
        username: proxyConfig.username,
        password: proxyConfig.password
      });
      console.log("✅ Proxy authenticated");
    }

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("🌐 Loading page...");
    await page.goto("https://gamety.org/?pages=reg", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log("✅ Page loaded");

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
    
    // Try OCR first
    let captcha = await recognizeCaptcha();

    // Fallback to 2Captcha if OCR fails
    if ((!captcha || captcha.length !== 4) && USE_2CAPTCHA) {
      console.log("⚠️ OCR failed, trying 2Captcha...");
      captcha = await solve2Captcha();
    }

    if (!captcha || captcha.length !== 4) {
      console.log("❌ All captcha methods failed");
      await browser.close();
      return { success: false, reason: "captcha_failed" };
    }

    console.log(`🔍 Final Captcha: ${captcha}`);
    await page.type('#form input[name="cap"]', captcha, { delay: 50 });

    console.log("📨 Submitting...");
    await Promise.all([
      page.click('#form button[name="sub_reg"]'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 })
    ]);

    const bodyText = await page.evaluate(() => document.body.innerText);
    await browser.close();

    if (/success|successful|berhasil|congratulations/i.test(bodyText)) {
      console.log("✅ REGISTER SUCCESS!");
      
      const data = `${username}:${email}:${password}\n`;
      fs.appendFileSync("accounts.txt", data);
      
      return { success: true, username, email, password };
    } else if (/already.*registration.*ip|ip.*already/i.test(bodyText)) {
      console.log("🚫 IP BLOCKED");
      return { success: false, reason: "ip_blocked" };
    } else if (/captcha|wrong code|verification code.*incorrect/i.test(bodyText)) {
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
  const results = { success: 0, failed: 0, accounts: [] };

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
      
      // Retry wrong captcha 2x
      if (result.reason === "wrong_captcha") {
        for (let retry = 1; retry <= 2; retry++) {
          console.log(`🔄 Retry ${retry}/2...`);
          await new Promise(r => setTimeout(r, 2000));
          
          const retryResult = await registerAccount(i, proxy);
          if (retryResult.success) {
            results.success++;
            results.accounts.push(retryResult);
            results.failed--;
            break;
          }
        }
      }
    }

    if (i < totalAccounts) {
      const delay = 3000 + Math.random() * 2000;
      console.log(`⏳ Delay ${(delay/1000).toFixed(1)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 SUMMARY");
  console.log("=".repeat(50));
  console.log(`✅ Success: ${results.success}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📁 Akun tersimpan di: accounts.txt`);
  console.log("=".repeat(50));

  try {
    if (fs.existsSync("captcha_temp.png")) fs.unlinkSync("captcha_temp.png");
  } catch (e) {}
})();
