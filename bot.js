import puppeteer from "puppeteer";
import Tesseract from "tesseract.js";
import sharp from "sharp";
import fs from "fs";
import readline from "readline-sync";
import dotenv from "dotenv";

dotenv.config();

/* ================= GLOBAL CONFIG ================= */
let proxyList = [];
let totalAccounts = 0;
let CAPTCHA_METHOD = null;
let stats = { success: 0, failed: 0, ocrFailed: 0, apiKeyError: 0 };

/* ================= MAIN MENU ================= */
function showMenu() {
  console.clear();
  console.log(`
${"=".repeat(60)}
           AUTO REGISTER BOT - GAMETY.ORG
${"=".repeat(60)}

📊 STATISTICS (Session)
   ✅ Success    : ${stats.success}
   ❌ Failed     : ${stats.failed}
   🔍 OCR Failed : ${stats.ocrFailed}
   🔑 API Error  : ${stats.apiKeyError}

${"=".repeat(60)}
           CAPTCHA SOLVING METHOD
${"=".repeat(60)}

1. 🤖 OCR (Free, ~70% accuracy)
2. 🔑 2Captcha API (Paid, ~99% accuracy, need API key in .env)
3. 👁️  Manual Input (100% accuracy, you type captcha)

0. ❌ Exit

${"=".repeat(60)}
  `);

  const choice = readline.question("Pilih method (0-3): ");
  return choice;
}

/* ================= OCR METHOD ================= */
async function solveCaptchaOCR() {
  console.log("🔍 Solving with OCR...");
  
  const strategies = [
    { resize: 600, blur: 0.3, threshold: 180, name: "Thin Preserve" },
    { resize: 700, blur: 0.5, threshold: 170, name: "Light Enhance" },
    { resize: 800, blur: 0.4, threshold: 175, name: "Balanced" },
    { resize: 500, blur: 0.2, threshold: 185, name: "Minimal Process" }
  ];

  for (const strategy of strategies) {
    try {
      await sharp("captcha.png")
        .resize(strategy.resize, Math.floor(strategy.resize * 0.375), { 
          fit: "inside",
          kernel: "lanczos3" 
        })
        .extend({ 
          top: 10, 
          bottom: 10, 
          left: 10, 
          right: 10, 
          background: { r: 255, g: 255, b: 255, alpha: 1 } 
        })
        .normalize()
        .blur(strategy.blur)
        .grayscale()
        .threshold(strategy.threshold)
        .toFile("captcha_temp.png");

      for (const psm of [7, 8, 13, 6]) {
        const { data: { text, confidence } } = await Tesseract.recognize(
          "captcha_temp.png",
          "eng",
          {
            tessedit_char_whitelist: "0123456789",
            psm: psm
          }
        );

        const result = text.replace(/\D/g, "").trim();
        
        if (result.length === 4) {
          console.log(`✅ OCR Success: "${result}" [${strategy.name}, PSM${psm}, ${confidence.toFixed(0)}%]`);
          try { fs.unlinkSync("captcha_temp.png"); } catch (e) {}
          return result;
        }
      }
    } catch (err) {
      // Continue to next strategy
    }
  }

  try { fs.unlinkSync("captcha_temp.png"); } catch (e) {}
  console.log("❌ OCR failed to read captcha");
  return null;
}

/* ================= 2CAPTCHA API METHOD ================= */
async function solveCaptcha2Captcha() {
  const apiKey = process.env.CAPTCHA_API_KEY;
  
  if (!apiKey) {
    console.log("❌ CAPTCHA_API_KEY tidak ditemukan di .env");
    console.log("💡 Buat file .env dengan isi:");
    console.log("   CAPTCHA_API_KEY=your_api_key_here");
    stats.apiKeyError++;
    return null;
  }

  console.log("🤖 Solving with 2Captcha API...");

  try {
    const imageBuffer = fs.readFileSync("captcha.png");
    const base64Image = imageBuffer.toString("base64");

    // Submit captcha
    const submitUrl = `http://2captcha.com/in.php?key=${apiKey}&method=base64&body=${base64Image}&numeric=1&min_len=4&max_len=4`;
    const submitRes = await fetch(submitUrl);
    const submitText = await submitRes.text();

    if (!submitText.startsWith("OK|")) {
      console.log("❌ 2Captcha submit error:", submitText);
      if (submitText.includes("ERROR_WRONG_USER_KEY")) {
        console.log("💡 API Key salah! Cek file .env");
        stats.apiKeyError++;
      }
      return null;
    }

    const captchaId = submitText.split("|")[1];
    console.log(`⏳ Captcha ID: ${captchaId}, waiting...`);

    // Poll for result (max 60s)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));

      const resultUrl = `http://2captcha.com/res.php?key=${apiKey}&action=get&id=${captchaId}`;
      const resultRes = await fetch(resultUrl);
      const resultText = await resultRes.text();

      if (resultText.startsWith("OK|")) {
        const answer = resultText.split("|")[1];
        
        // Validate answer
        if (!answer || answer === "none" || answer.length !== 4 || !/^\d{4}$/.test(answer)) {
          console.log(`\n❌ 2Captcha invalid answer: "${answer}"`);
          return null;
        }
        
        console.log(`✅ 2Captcha solved: ${answer}`);
        return answer;
      } else if (resultText === "CAPCHA_NOT_READY") {
        process.stdout.write(".");
      } else {
        console.log("\n❌ 2Captcha error:", resultText);
        return null;
      }
    }

    console.log("\n⏱️ 2Captcha timeout");
    return null;

  } catch (err) {
    console.log("❌ 2Captcha error:", err.message);
    return null;
  }
}

/* ================= MANUAL METHOD ================= */
async function solveCaptchaManual() {
  console.log("\n" + "=".repeat(60));
  console.log("👁️  MANUAL CAPTCHA INPUT");
  console.log("=".repeat(60));
  console.log("📸 Buka file: captcha.png");
  console.log("📸 Atau lihat di terminal jika support image preview");
  console.log("=".repeat(60));
  
  const captcha = readline.question("Ketik captcha (4 digit) atau 'back' untuk kembali: ").trim();
  
  if (captcha.toLowerCase() === "back") {
    return null;
  }
  
  if (captcha.length !== 4 || !/^\d{4}$/.test(captcha)) {
    console.log("❌ Captcha harus 4 digit angka");
    return null;
  }
  
  console.log(`✅ Manual input: ${captcha}`);
  return captcha;
}

/* ================= PARSE PROXY ================= */
function parseProxy(proxy) {
  const clean = proxy.replace(/^https?:\/\//, "").replace(/^socks5:\/\//, "");
  
  if (clean.includes("@")) {
    const [authPart, hostPart] = clean.split("@");
    const [username, password] = authPart.split(":");
    return { username, password, host: hostPart };
  }
  return { username: null, password: null, host: clean };
}

/* ================= REGISTER ACCOUNT ================= */
async function registerAccount(accountNum, proxy = null) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎯 CREATING ACCOUNT #${accountNum}/${totalAccounts}`);
  if (proxy) console.log(`🔁 Proxy: ${proxy.substring(0, 45)}...`);
  console.log("=".repeat(60));

  let proxyConfig = proxy ? parseProxy(proxy) : null;

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

    if (proxyConfig?.username && proxyConfig?.password) {
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

    console.log("🌐 Loading registration page...");
    await page.goto("https://gamety.org/?pages=reg", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log("⏳ Waiting for form...");
    await page.waitForSelector("#form", { visible: true, timeout: 60000 });
    await page.waitForFunction(() => {
      const f = document.querySelector("#form");
      return f && 
        f.querySelector('input[name="login"]') && 
        f.querySelector('input[name="email"]') && 
        f.querySelector('input[name="pass"]') && 
        f.querySelector('input[name="cap"]');
    }, { timeout: 60000 });

    console.log("✅ Form ready");

    // Generate account data
    const uid = Date.now() + Math.floor(Math.random() * 1000);
    const username = `user${uid}`;
    const email = `${username}@gmail.com`;
    const password = "Password123!";

    // Fill form
    await page.type('#form input[name="login"]', username, { delay: 50 });
    await page.type('#form input[name="email"]', email, { delay: 50 });
    await page.type('#form input[name="pass"]', password, { delay: 50 });
    console.log(`✍️  Filled: ${username} / ${email}`);

    // Get captcha image
    const capImg = await page.$("#cap_img");
    if (!capImg) {
      console.log("❌ Captcha image not found");
      await browser.close();
      return { success: false, reason: "no_captcha" };
    }

    await capImg.screenshot({ path: "captcha.png", type: "png" });
    console.log("📸 Captcha saved");

    // Solve captcha based on method
    let captcha = null;

    if (CAPTCHA_METHOD === "1") {
      captcha = await solveCaptchaOCR();
      if (!captcha) {
        stats.ocrFailed++;
      }
    } else if (CAPTCHA_METHOD === "2") {
      captcha = await solveCaptcha2Captcha();
      if (!captcha) {
        console.log("\n⚠️  2Captcha failed - Captcha might be too difficult");
        console.log("💡 Captcha ini mungkin terlalu sulit untuk 2Captcha");
        console.log("💡 Recommendation: Use Manual method (option 3)");
      }
    } else if (CAPTCHA_METHOD === "3") {
      captcha = await solveCaptchaManual();
    }

    if (!captcha || captcha.length !== 4 || !/^\d{4}$/.test(captcha)) {
      console.log("❌ Failed to solve captcha or invalid format");
      await browser.close();
      return { success: false, reason: "captcha_unsolved" };
    }

    // Input captcha
    await page.type('#form input[name="cap"]', captcha, { delay: 50 });

    // Submit form
    console.log("📨 Submitting registration...");
    
    try {
      await Promise.all([
        page.click('#form button[name="sub_reg"]'),
        page.waitForNavigation({ 
          waitUntil: "networkidle2", 
          timeout: 60000 
        })
      ]);
    } catch (navError) {
      console.log("⚠️  Navigation timeout - checking response anyway...");
      // Continue to check response even if navigation times out
    }

    // Check result
    const bodyText = await page.evaluate(() => document.body.innerText);
    const pageUrl = page.url();
    
    console.log(`📍 Current URL: ${pageUrl}`);
    
    await browser.close();

    // Parse response
    if (/success|successful|berhasil|congratulations|welcome/i.test(bodyText)) {
      console.log("✅ REGISTRATION SUCCESS!");
      console.log(`📝 Username: ${username}`);
      console.log(`📧 Email   : ${email}`);
      console.log(`🔑 Password: ${password}`);
      
      // Save to file
      const data = `${username}:${email}:${password}\n`;
      fs.appendFileSync("accounts.txt", data);
      
      stats.success++;
      return { success: true, username, email, password };
      
    } else if (/captcha|wrong code|verification code.*incorrect|kode.*salah/i.test(bodyText)) {
      console.log("❌ CAPTCHA WRONG");
      stats.failed++;
      return { success: false, reason: "wrong_captcha" };
      
    } else if (/already.*registration.*ip|ip.*already|sudah.*registrasi/i.test(bodyText)) {
      console.log("🚫 IP BLOCKED - Use different proxy");
      stats.failed++;
      return { success: false, reason: "ip_blocked" };
      
    } else if (/username.*exist|email.*exist|already.*taken|sudah.*digunakan/i.test(bodyText)) {
      console.log("⚠️ Username/Email already exists");
      stats.failed++;
      return { success: false, reason: "duplicate" };
      
    } else if (/disabled|registration.*closed|ditutup/i.test(bodyText)) {
      console.log("🚫 REGISTRATION DISABLED");
      stats.failed++;
      return { success: false, reason: "registration_closed" };
      
    } else {
      console.log("⚠️ UNKNOWN RESPONSE - Analyzing...");
      console.log("\n" + "=".repeat(60));
      console.log("FULL RESPONSE:");
      console.log("=".repeat(60));
      console.log(bodyText);
      console.log("=".repeat(60));
      
      // Try to find any success indicators
      if (pageUrl !== "https://gamety.org/?pages=reg" && !pageUrl.includes("pages=reg")) {
        console.log("\n💡 URL changed - Might be success (redirected)");
        console.log("   Saving account just in case...");
        
        const data = `${username}:${email}:${password} # VERIFY_MANUALLY\n`;
        fs.appendFileSync("accounts.txt", data);
        
        stats.success++;
        return { success: true, username, email, password, needsVerification: true };
      }
      
      stats.failed++;
      return { success: false, reason: "unknown" };
    }

  } catch (err) {
    console.log("❌ ERROR:", err.message);
    if (browser) await browser.close();
    stats.failed++;
    return { success: false, reason: "error", error: err.message };
  }
}

/* ================= BULK REGISTER ================= */
async function bulkRegister() {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 STARTING BULK REGISTRATION");
  console.log("=".repeat(60));
  console.log(`📊 Method: ${CAPTCHA_METHOD === "1" ? "OCR" : CAPTCHA_METHOD === "2" ? "2Captcha API" : "Manual"}`);
  console.log(`🎯 Target: ${totalAccounts} accounts`);
  console.log(`🔁 Proxies: ${proxyList.length > 0 ? proxyList.length : "None"}`);
  console.log("=".repeat(60) + "\n");

  for (let i = 1; i <= totalAccounts; i++) {
    const proxy = proxyList.length > 0 ? proxyList[(i - 1) % proxyList.length] : null;
    
    const result = await registerAccount(i, proxy);

    // Smart retry logic
    if (!result.success) {
      if (result.reason === "captcha_unsolved" && CAPTCHA_METHOD === "2") {
        console.log("\n" + "=".repeat(60));
        console.log("⚠️  2CAPTCHA FAILED!");
        console.log("=".repeat(60));
        console.log("Captcha ini terlalu sulit untuk 2Captcha.");
        console.log("Bot akan KEMBALI KE MENU setelah batch selesai.");
        console.log("Gunakan method OCR (1) atau Manual (3) untuk retry.");
        console.log("=".repeat(60) + "\n");
      }
      
      // Retry once if wrong captcha (except for manual mode)
      if (result.reason === "wrong_captcha" && CAPTCHA_METHOD !== "3") {
        console.log("🔄 Retrying once...");
        await new Promise(r => setTimeout(r, 2000));
        await registerAccount(i, proxy);
      }
    }

    // Delay between accounts
    if (i < totalAccounts) {
      const delay = 3000 + Math.random() * 2000;
      console.log(`⏳ Waiting ${(delay / 1000).toFixed(1)}s before next account...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Show final summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 REGISTRATION COMPLETED");
  console.log("=".repeat(60));
  console.log(`✅ Success : ${stats.success}`);
  console.log(`❌ Failed  : ${stats.failed}`);
  if (CAPTCHA_METHOD === "1") {
    console.log(`🔍 OCR Failed: ${stats.ocrFailed}`);
  }
  if (stats.apiKeyError > 0) {
    console.log(`🔑 API Error: ${stats.apiKeyError}`);
  }
  console.log(`📁 Saved to: accounts.txt`);
  console.log("=".repeat(60) + "\n");

  readline.question("Press ENTER to continue...");
}

/* ================= SETUP ================= */
async function setup() {
  // Load proxies
  if (fs.existsSync("proxies.txt")) {
    proxyList = fs.readFileSync("proxies.txt", "utf8")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);
  }

  console.log("\n📋 Proxy Configuration:");
  if (proxyList.length > 0) {
    console.log(`   ✅ ${proxyList.length} proxy loaded from proxies.txt`);
  } else {
    console.log(`   ⚠️  No proxy (registration from your IP)`);
  }

  totalAccounts = parseInt(readline.question("\nBerapa akun yang mau dibuat? ")) || 1;
  console.log(`✅ Target set: ${totalAccounts} accounts\n`);
}

/* ================= MAIN LOOP ================= */
async function main() {
  await setup();

  while (true) {
    CAPTCHA_METHOD = showMenu();

    if (CAPTCHA_METHOD === "0") {
      console.log("\n👋 Goodbye!\n");
      process.exit(0);
    }

    if (!["1", "2", "3"].includes(CAPTCHA_METHOD)) {
      console.log("❌ Invalid choice");
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    // Check API key for method 2
    if (CAPTCHA_METHOD === "2") {
      if (!process.env.CAPTCHA_API_KEY) {
        console.log("\n❌ 2Captcha API Key tidak ditemukan!");
        console.log("💡 Buat file .env dengan format:");
        console.log("   CAPTCHA_API_KEY=your_2captcha_api_key_here");
        console.log("");
        readline.question("Press ENTER to continue...");
        continue;
      } else {
        console.log(`\n✅ API Key found: ${process.env.CAPTCHA_API_KEY.substring(0, 10)}...`);
      }
    }

    await bulkRegister();
  }
}

/* ================= START ================= */
console.log("\n🚀 Starting Auto Register Bot...\n");
main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
