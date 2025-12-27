import puppeteer from "puppeteer";
import Tesseract from "tesseract.js";
import fs from "fs";
import readline from "readline-sync";

/* ================= MENU ================= */
console.log(`
==============================
 AUTO REGISTER BOT
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

  await page.goto("https://gamety.org/?pages=reg", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  console.log("🌐 Page opened:", page.url());

  /* ================= WAIT FORM (ANTI ROCKET LOADER) ================= */
  console.log("⏳ Menunggu container #form...");
  await page.waitForSelector("#form", { visible: true, timeout: 60000 });

  console.log("⏳ Menunggu input di-inject JS...");
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

  console.log("✅ Form siap sepenuhnya");

  /* ================= FILL FORM ================= */
  const uid = Date.now();

  await page.type('#form input[name="login"]', `user${uid}`, { delay: 80 });
  await page.type('#form input[name="email"]', `user${uid}@gmail.com`, { delay: 80 });
  await page.type('#form input[name="pass"]', "Password123!", { delay: 80 });

  console.log("✍️ Data user diisi");

  /* ================= CAPTCHA ================= */
  const capImg = await page.$("#cap_img");
  if (!capImg) {
    console.log("❌ CAPTCHA image tidak ditemukan");
    await browser.close();
    return;
  }

  await capImg.screenshot({ path: "captcha.png" });
  console.log("🧩 captcha.png disimpan");

  const {
    data: { text }
  } = await Tesseract.recognize("captcha.png", "eng", {
    tessedit_char_whitelist: "0123456789"
  });

  const captcha = text.replace(/\D/g, "").trim();
  console.log("🔍 OCR Result:", captcha);

  if (captcha.length !== 4) {
    console.log("❌ OCR captcha invalid → STOP");
    await browser.close();
    return;
  }

  await page.type('#form input[name="cap"]', captcha, { delay: 80 });

  /* ================= SUBMIT ================= */
  console.log("📨 Submit form...");
  await Promise.all([
    page.click('#form button[name="sub_reg"]'),
    page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout: 60000
    })
  ]);

  /* ================= RESULT ================= */
  const bodyText = await page.evaluate(() => document.body.innerText);

  if (/success|successful/i.test(bodyText)) {
    console.log("✅ REGISTER SUCCESS");
  } else if (/captcha/i.test(bodyText)) {
    console.log("❌ CAPTCHA SALAH");
  } else if (/disabled/i.test(bodyText)) {
    console.log("🚫 REGISTRATION DISABLED");
  } else {
    console.log("⚠️ RESPONSE TIDAK DIKENALI");
  }

  await browser.close();
})();
