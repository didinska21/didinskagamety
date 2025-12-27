import puppeteer from "puppeteer";
import readline from "readline-sync";
import fs from "fs";

console.log(`
============================================================
         DEEP DEBUG REGISTRATION ANALYSIS
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
    headless: true, // Must be true on server without GUI
    defaultViewport: { width: 1366, height: 768 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process"
    ]
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

  // Monitor all network requests
  const networkLog = [];
  page.on('request', request => {
    networkLog.push({
      type: 'request',
      method: request.method(),
      url: request.url(),
      headers: request.headers(),
      postData: request.postData()
    });
  });

  page.on('response', async response => {
    networkLog.push({
      type: 'response',
      status: response.status(),
      url: response.url(),
      headers: response.headers()
    });
  });

  // Monitor console logs
  page.on('console', msg => {
    console.log('🖥️  Browser Console:', msg.text());
  });

  // Go to registration page
  console.log("🌐 Loading registration page...");
  await page.goto("https://gamety.org/?pages=reg", {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await page.waitForSelector("#form", { visible: true, timeout: 60000 });
  console.log("✅ Form loaded");

  // Analyze form structure
  const formInfo = await page.evaluate(() => {
    const form = document.querySelector("#form");
    const button = form.querySelector('button[name="sub_reg"]');
    
    return {
      formAction: form.action || "NO_ACTION",
      formMethod: form.method || "NO_METHOD",
      formId: form.id,
      formOnSubmit: form.onsubmit ? form.onsubmit.toString() : "NO_ONSUBMIT",
      buttonType: button.type,
      buttonName: button.name,
      buttonOnClick: button.onclick ? button.onclick.toString() : "NO_ONCLICK",
      allInputs: Array.from(form.querySelectorAll('input')).map(inp => ({
        name: inp.name,
        type: inp.type,
        required: inp.required
      }))
    };
  });

  console.log("\n" + "=".repeat(60));
  console.log("📋 FORM STRUCTURE ANALYSIS:");
  console.log("=".repeat(60));
  console.log(JSON.stringify(formInfo, null, 2));
  console.log("=".repeat(60));

  // Fill form
  const uid = Date.now();
  const username = `testuser${uid}`;
  const email = `${username}@gmail.com`;
  const password = "Password123!";

  await page.type('#form input[name="login"]', username, { delay: 50 });
  await page.type('#form input[name="email"]', email, { delay: 50 });
  await page.type('#form input[name="pass"]', password, { delay: 50 });

  console.log(`\n✍️  Filled: ${username}`);

  // Captcha
  const capImg = await page.$("#cap_img");
  await capImg.screenshot({ path: "debug_captcha.png" });
  console.log("📸 Captcha saved to debug_captcha.png");

  const captcha = readline.question("\nKetik captcha (4 digit): ");
  await page.type('#form input[name="cap"]', captcha, { delay: 50 });

  console.log("\n📨 Submitting...");
  console.log("🔍 Watching network traffic...");

  // Clear network log before submit
  networkLog.length = 0;

  // Check if there's any JavaScript validation (getEventListeners not available in headless)
  console.log("🔍 Checking for validation scripts...");

  // Submit using different methods to see which works
  console.log("\n🧪 TEST 1: Click button");
  await page.click('#form button[name="sub_reg"]');
  
  // Wait and observe
  await new Promise(r => setTimeout(r, 5000));

  // Check if anything changed
  const afterClick = {
    url: page.url(),
    hasAlert: await page.evaluate(() => {
      const alerts = document.querySelectorAll('.alert, .error, .success, .message');
      return Array.from(alerts).map(a => a.innerText);
    }),
    bodyText: await page.evaluate(() => document.body.innerText)
  };

  console.log("\n" + "=".repeat(60));
  console.log("📊 AFTER SUBMIT:");
  console.log("=".repeat(60));
  console.log("URL:", afterClick.url);
  console.log("Alerts:", afterClick.hasAlert);
  console.log("\n" + "=".repeat(60));
  console.log("NETWORK LOG:");
  console.log("=".repeat(60));
  
  // Filter important requests (POST/form submissions)
  const importantRequests = networkLog.filter(log => 
    log.type === 'request' && 
    (log.method === 'POST' || log.url.includes('reg') || log.postData)
  );

  if (importantRequests.length > 0) {
    console.log("📤 POST Requests found:");
    importantRequests.forEach(req => {
      console.log(`   URL: ${req.url}`);
      console.log(`   Method: ${req.method}`);
      console.log(`   Data: ${req.postData || 'EMPTY'}`);
    });
  } else {
    console.log("⚠️  NO POST REQUEST DETECTED!");
    console.log("   This means the form is NOT submitting!");
  }

  // Get all network responses
  const responses = networkLog.filter(log => log.type === 'response');
  console.log(`\n📥 Total responses: ${responses.length}`);
  
  if (responses.length > 0) {
    console.log("\nKey responses:");
    responses.slice(0, 5).forEach(res => {
      console.log(`   ${res.status} - ${res.url.substring(0, 80)}`);
    });
  }

  console.log("\n" + "=".repeat(60));

  // Save full logs
  fs.writeFileSync("network_log.json", JSON.stringify(networkLog, null, 2));
  console.log("💾 Full network log saved to network_log.json");

  fs.writeFileSync("debug_response_full.txt", afterClick.bodyText);
  console.log("💾 Full response saved to debug_response_full.txt");

  // Try alternative submission methods
  console.log("\n" + "=".repeat(60));
  console.log("🧪 TESTING ALTERNATIVE SUBMISSION METHODS:");
  console.log("=".repeat(60));

  // Reload page for clean test
  await page.goto("https://gamety.org/?pages=reg", { waitUntil: "networkidle2" });
  await page.waitForSelector("#form");
  
  // Fill again
  await page.type('#form input[name="login"]', username + "2", { delay: 50 });
  await page.type('#form input[name="email"]', username + "2@gmail.com", { delay: 50 });
  await page.type('#form input[name="pass"]', password, { delay: 50 });
  await page.type('#form input[name="cap"]', captcha, { delay: 50 });

  networkLog.length = 0;

  console.log("\n🧪 TEST 2: Form.submit()");
  await page.evaluate(() => {
    document.querySelector('#form').submit();
  });

  await new Promise(r => setTimeout(r, 5000));

  const test2Requests = networkLog.filter(log => log.type === 'request' && log.method === 'POST');
  console.log(`Result: ${test2Requests.length > 0 ? '✅ POST detected' : '❌ No POST'}`);

  console.log("\n⏳ Waiting 10 seconds for final analysis...");
  console.log("   (Server mode - no GUI available)");
  
  await new Promise(r => setTimeout(r, 10000));
  await browser.close();

  console.log("\n" + "=".repeat(60));
  console.log("🔍 DIAGNOSIS:");
  console.log("=".repeat(60));
  console.log("1. Check network_log.json for actual requests");
  console.log("2. Check debug_response_full.txt for page content");
  console.log("3. Look for JavaScript errors in browser console");
  console.log("=".repeat(60));
})();
