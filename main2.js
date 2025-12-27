import puppeteer from "puppeteer";
import fs from "fs";
import readline from "readline-sync";

/* ================= CONFIG ================= */
const TOTAL_ACCOUNT = 10; // ← ganti sesuai kebutuhan
const TARGET_URL = "https://gamety.org/?pages=reg";

/* ================= MENU ================= */
console.log(`
==============================
 AUTO REGISTER BOT (MANUAL CAPTCHA)
==============================
1. Tanpa Proxy
2. Proxy Statis
3. Proxy Rotating
==============================
`);

const choice = readline.question("Pilih mode (1/2/3): ");
let proxy = null;

if (choice === "2") {
  proxy = readline.question("Masukkan proxy (http://user:pass@ip:port): ");
}

if (choice === "3") {
  const list = fs.readFileSync("proxies.txt", "utf8")
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  if (!list.length) {
    console.log("❌ proxies.txt kosong");
    process.exit(1);
  }

  proxy = list[Math.floor(Math.random() * list.length)];
  console.log("🔁 Proxy dipilih:", proxy);
}

/* ================= BROWSER ================= */
const launchOptions = {
  headless: true, // VPS safe
  defaultViewport: { width: 1366, height: 768 },
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu"
  ]
};

if (proxy) launchOptions.args.push(`--proxy-server=${proxy}`);

/* ================= MAIN ================= */
(async () => {
  console.log("🚀 Launching browser...");
  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  // proxy auth
  if (proxy && proxy.includes("@")) {
    const auth = proxy.split("@")[0].replace(/^https?:\/\//, "");
    const [username, password] = auth.split(":");
    await page.authenticate({ username, password });
  }

  for (let i = 1; i <= TOTAL_ACCOUNT; i++) {
    console.log(`\n==============================`);
    console.log(`👤 MEMBUAT AKUN KE-${i}`);
    console.log(`==============================`);

    await page.goto(TARGET_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    /* ===== WAIT FORM (ANTI ROCKET LOADER) ===== */
    await page.waitForSelector("#form", { visible: true, timeout: 60000 });
    await page.waitForFunction(() => {
      const f = document.querySelector("#form");
      return (
        f &&
        f.querySelector('input[name="login"]') &&
        f.querySelector('input[name="email"]') &&
        f.querySelector('input[name="pass"]') &&
        f.querySelector('input[name="cap"]')
      );
    }, { timeout: 60000 });

    console.log("✅ Form siap");

    /* ===== FILL USER DATA ===== */
    const uid = Date.now() + i;

    await page.evaluate(() => {
      document.querySelector('#form input[name="login"]').value = "";
      document.querySelector('#form input[name="email"]').value = "";
      document.querySelector('#form input[name="pass"]').value = "";
      document.querySelector('#form input[name="cap"]').value = "";
    });

    await page.type('#form input[name="login"]', `user${uid}`, { delay: 60 });
    await page.type('#form input[name="email"]', `user${uid}@gmail.com`, { delay: 60 });
    await page.type('#form input[name="pass"]', "Password123!", { delay: 60 });

    /* ===== CAPTCHA SAVE ===== */
    const capImg = await page.$("#cap_img");
    if (!capImg) {
      console.log("❌ CAPTCHA tidak ditemukan");
      continue;
    }

    const captchaPath = `captcha/captcha${i}.png`;
    await capImg.screenshot({ path: captchaPath });
    console.log(`🧩 CAPTCHA disimpan: ${captchaPath}`);

    /* ===== MANUAL INPUT CAPTCHA ===== */
    console.log(`👉 Buka file ${captchaPath}`);
    const captchaValue = readline.question("✍️ Masukkan captcha: ");

    await page.type('#form input[name="cap"]', captchaValue, { delay: 60 });

    /* ===== SUBMIT ===== */
    console.log("📨 Submit form...");
    await Promise.all([
      page.click('#form button[name="sub_reg"]'),
      page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: 60000
      })
    ]);

    /* ===== RESULT ===== */
    const bodyText = await page.evaluate(() => document.body.innerText);

    if (/success|successful/i.test(bodyText)) {
      console.log(`✅ AKUN KE-${i} BERHASIL`);
    } else if (/captcha/i.test(bodyText)) {
      console.log(`❌ CAPTCHA SALAH (akun ke-${i})`);
    } else if (/disabled/i.test(bodyText)) {
      console.log(`🚫 REGISTRATION DISABLED`);
      break;
    } else {
      console.log(`⚠️ RESPONSE TIDAK DIKENALI`);
    }
  }

  await browser.close();
  console.log("\n🎉 SELESAI SEMUA PROSES");
})();
