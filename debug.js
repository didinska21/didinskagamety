import puppeteer from "puppeteer";
import readline from "readline-sync";
import fs from "fs";

console.log(`
============================================================
         DEBUG REGISTRATION RESPONSE
============================================================
`);

const proxy = fs.existsSync("proxies.txt")
  ? fs.readFileSync("proxies.txt", "utf8").split("\n")[0].trim()
  : null;

function parseProxy(proxy) {
  const clean = proxy.replace(/^https?:\/\//, "");
  if (clean.includes("@")) {
    const [authPart, hostPart] = clean.split("@");
    const [username, password] = authPart.split(":");
    return { username, password, host: hostPart };
  }
  return { username: null, password: null, host: clean };
}

(async () => {
  const proxyConfig = proxy ? parseProxy(proxy) : null;

  const launchOptions = {
    headless: false, // Show browser for debugging
    defaultViewport: { width: 1366, height: 768 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  };

  if (proxyConfig) {
    launchOptions.args.push(`--proxy-server=http://${proxyConfig.host}`);
  }

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  if (proxyConfig?.username && proxyConfig?.password) {
    await page.authenticate({
      username: proxyConfig.username,
      password: proxyConfig.password
    });
  }

  // Go to registration page
  await page.goto("https://gamety.org/?pages=reg", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForSelector("#form", { visible: true, timeout: 60000 });
  await page.waitForFunction(() => {
    const f = document.querySelector("#form");
    return f && f.querySelector('input[name="login"]');
  }, { timeout: 60000 });

  // Fill form
  const uid = Date.now();
  const username = `testuser${uid}`;
  const email = `${username}@gmail.com`;
  const password = "Password123!";

  await page.type('#form input[name="login"]', username, { delay: 50 });
  await page.type('#form input[name="email"]', email, { delay: 50 });
  await page.type('#form input[name="pass"]', password, { delay: 50 });

  console.log(`✍️  Filled: ${username}`);

  // Captcha
  const capImg = await page.$("#cap_img");
  await capImg.screenshot({ path: "debug_captcha.png" });
  console.log("📸 Captcha saved to debug_captcha.png");

  const captcha = readline.question("\nKetik captcha (4 digit): ");
  await page.type('#form input[name="cap"]', captcha, { delay: 50 });

  console.log("\n📨 Submitting...");

  // Submit and wait
  await page.click('#form button[name="sub_reg"]');
  
  // Wait a bit for response
  await new Promise(r => setTimeout(r, 3000));

  // Get all info
  const url = page.url();
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText);
  const bodyHTML = await page.evaluate(() => document.body.innerHTML);

  console.log("\n" + "=".repeat(60));
  console.log("DEBUG INFO");
  console.log("=".repeat(60));
  console.log(`URL   : ${url}`);
  console.log(`Title : ${title}`);
  console.log("\n" + "=".repeat(60));
  console.log("BODY TEXT:");
  console.log("=".repeat(60));
  console.log(bodyText);
  console.log("\n" + "=".repeat(60));

  // Save HTML for inspection
  fs.writeFileSync("debug_response.html", bodyHTML);
  console.log("💾 HTML saved to debug_response.html");

  // Check for modal/popup
  const modalText = await page.evaluate(() => {
    const modals = document.querySelectorAll('.modal, .popup, .alert, .message, [role="dialog"]');
    return Array.from(modals).map(m => m.innerText).join("\n");
  });

  if (modalText) {
    console.log("\n" + "=".repeat(60));
    console.log("MODAL/POPUP CONTENT:");
    console.log("=".repeat(60));
    console.log(modalText);
    console.log("=".repeat(60));
  }

  // Analysis
  console.log("\n" + "=".repeat(60));
  console.log("ANALYSIS:");
  console.log("=".repeat(60));

  if (/success|berhasil|congratulations|welcome/i.test(bodyText)) {
    console.log("✅ SUCCESS detected!");
  } else if (/captcha|wrong|incorrect|salah/i.test(bodyText)) {
    console.log("❌ CAPTCHA WRONG detected");
  } else if (/ip.*already|sudah.*registrasi/i.test(bodyText)) {
    console.log("🚫 IP BLOCK detected");
  } else if (/disabled|closed|ditutup/i.test(bodyText)) {
    console.log("🚫 REGISTRATION CLOSED detected");
  } else {
    console.log("⚠️  No clear success/error pattern found");
    console.log("💡 Check debug_response.html for full HTML");
  }

  console.log("\n📝 Test account:");
  console.log(`   Username: ${username}`);
  console.log(`   Email   : ${email}`);
  console.log(`   Password: ${password}`);

  console.log("\n⏸️  Browser will stay open for 30 seconds...");
  console.log("   Inspect the page manually!");
  
  await new Promise(r => setTimeout(r, 30000));
  await browser.close();
})();
