import puppeteer from "puppeteer";
import fs from "fs";
import readline from "readline-sync";

/* ================= GLOBAL CONFIG ================= */
let proxyList = [];
let burnedProxies = []; // Track burned proxies
let totalAccounts = 0;
let stats = { success: 0, failed: 0, ipBlocked: 0 };

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
   🔥 IP Blocked : ${stats.ipBlocked}
   🔁 Available Proxies: ${proxyList.length - burnedProxies.length}/${proxyList.length}

${"=".repeat(60)}
           CAPTCHA SOLVING METHOD
${"=".repeat(60)}

1. 👁️  Manual Input (100% accuracy - You type captcha)

0. ❌ Exit

${"=".repeat(60)}
  `);

  const choice = readline.question("Pilih method (0-1): ");
  return choice;
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

/* ================= GET FRESH PROXY ================= */
function getFreshProxy(index) {
  if (proxyList.length === 0) return null;
  
  // Filter out burned proxies
  const freshProxies = proxyList.filter(p => !burnedProxies.includes(p));
  
  if (freshProxies.length === 0) {
    console.log("\n⚠️  WARNING: All proxies are burned!");
    console.log("   Add more proxies to proxies.txt");
    return null;
  }
  
  // Use round-robin on fresh proxies only
  return freshProxies[index % freshProxies.length];
}
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

    // Solve captcha manually
    const captcha = await solveCaptchaManual();

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
    }

    // Check result
    const bodyText = await page.evaluate(() => document.body.innerText);
    const pageUrl = page.url();
    
    console.log(`📍 Current URL: ${pageUrl}`);
    
    // Save debug info
    const debugData = {
      timestamp: new Date().toISOString(),
      username,
      email,
      proxy: proxy || "NO_PROXY",
      captcha,
      url: pageUrl,
      response: bodyText
    };
    fs.appendFileSync("debug_log.json", JSON.stringify(debugData, null, 2) + ",\n");
    
    await browser.close();

    // Parse response
    if (/success|successful|berhasil|congratulations|welcome/i.test(bodyText)) {
      console.log("✅ REGISTRATION SUCCESS!");
      console.log(`📝 Username: ${username}`);
      console.log(`📧 Email   : ${email}`);
      console.log(`🔑 Password: ${password}`);
      
      const data = `${username}:${email}:${password}\n`;
      fs.appendFileSync("accounts.txt", data);
      
      stats.success++;
      return { success: true, username, email, password };
      
    } else if (/captcha|wrong code|verification code.*incorrect|kode.*salah/i.test(bodyText)) {
      console.log("❌ CAPTCHA WRONG");
      stats.failed++;
      return { success: false, reason: "wrong_captcha" };
      
    } else if (/already.*registration.*ip|ip.*already|sudah.*registrasi|There has already been registration from this IP/i.test(bodyText)) {
      console.log("🚫 IP BLOCKED - This proxy/IP already used for registration");
      console.log("💡 Marking this proxy as BURNED");
      
      // Mark proxy as burned
      if (proxy && !burnedProxies.includes(proxy)) {
        burnedProxies.push(proxy);
        fs.appendFileSync("burned_proxies.txt", `${proxy}\n`);
        console.log(`🔥 Burned proxy saved to burned_proxies.txt`);
      }
      
      console.log("💡 Response logged to debug_log.json");
      stats.failed++;
      stats.ipBlocked++;
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
      console.log("⚠️ UNKNOWN RESPONSE");
      console.log("💡 Full response logged to debug_log.json");
      console.log("\n" + "=".repeat(60));
      console.log("RESPONSE PREVIEW:");
      console.log("=".repeat(60));
      console.log(bodyText.substring(0, 500));
      console.log("=".repeat(60));
      
      if (pageUrl !== "https://gamety.org/?pages=reg" && !pageUrl.includes("pages=reg")) {
        console.log("\n💡 URL changed - Might be success (redirected)");
        console.log("   Saving account for manual verification...");
        
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
  console.log("🚀 STARTING REGISTRATION");
  console.log("=".repeat(60));
  console.log(`📊 Method: Manual Captcha Input`);
  console.log(`🎯 Target: ${totalAccounts} accounts`);
  console.log(`🔁 Proxies: ${proxyList.length > 0 ? proxyList.length : "None"}`);
  console.log("=".repeat(60) + "\n");

  for (let i = 1; i <= totalAccounts; i++) {
    const proxy = getFreshProxy(i - 1);
    
    if (!proxy && proxyList.length > 0) {
      console.log("\n❌ No fresh proxies available!");
      console.log("   Add more proxies to proxies.txt and restart");
      break;
    }
    
    const result = await registerAccount(i, proxy);

    // Retry once if wrong captcha
    if (!result.success && result.reason === "wrong_captcha") {
      console.log("🔄 Retrying with different captcha...");
      await new Promise(r => setTimeout(r, 2000));
      await registerAccount(i, proxy);
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
  console.log(`🔥 IP Blocked: ${stats.ipBlocked}`);
  console.log(`🔁 Fresh Proxies Remaining: ${proxyList.length - burnedProxies.length}/${proxyList.length}`);
  console.log(`📁 Accounts saved to: accounts.txt`);
  console.log(`🔍 Debug log saved to: debug_log.json`);
  if (burnedProxies.length > 0) {
    console.log(`🔥 Burned proxies saved to: burned_proxies.txt`);
  }
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
  
  // Load burned proxies from previous sessions
  if (fs.existsSync("burned_proxies.txt")) {
    burnedProxies = fs.readFileSync("burned_proxies.txt", "utf8")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);
    console.log(`\n🔥 Loaded ${burnedProxies.length} burned proxies from previous sessions`);
  }

  const freshProxies = proxyList.filter(p => !burnedProxies.includes(p));

  console.log("\n📋 Proxy Configuration:");
  if (proxyList.length > 0) {
    console.log(`   ✅ Total proxies: ${proxyList.length}`);
    console.log(`   🔥 Burned proxies: ${burnedProxies.length}`);
    console.log(`   ✨ Fresh proxies: ${freshProxies.length}`);
    console.log(`   💡 Bot will use fresh proxies only`);
    
    if (freshProxies.length === 0) {
      console.log("\n⚠️  WARNING: No fresh proxies available!");
      console.log("   All proxies in proxies.txt are burned.");
      console.log("   Add new proxies or delete burned_proxies.txt to retry.");
    }
  } else {
    console.log(`   ⚠️  No proxy detected (will use your IP)`);
    console.log(`   💡 Create proxies.txt to use proxy rotation`);
  }

  totalAccounts = parseInt(readline.question("\nBerapa akun yang mau dibuat? ")) || 1;
  
  if (freshProxies.length > 0 && totalAccounts > freshProxies.length) {
    console.log(`\n⚠️  WARNING: You have ${freshProxies.length} fresh proxies but want ${totalAccounts} accounts`);
    console.log(`   Some proxies will be reused (and might fail)`);
  }
  
  console.log(`✅ Target set: ${totalAccounts} accounts\n`);
}

/* ================= MAIN LOOP ================= */
async function main() {
  await setup();

  while (true) {
    const choice = showMenu();

    if (choice === "0") {
      console.log("\n👋 Goodbye!\n");
      process.exit(0);
    }

    if (choice !== "1") {
      console.log("❌ Invalid choice");
      await new Promise(r => setTimeout(r, 2000));
      continue;
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
