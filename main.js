import puppeteer from "puppeteer";
import Tesseract from "tesseract.js";
import fs from "fs";
import readline from "readline-sync";

// ================= MENU =================
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
    .map(p => p.trim())
    .filter(Boolean);
  proxy = list[Math.floor(Math.random() * list.length)];
  console.log("🔁 Proxy dipilih:", proxy);
}

// ================= BROWSER =================
const launchOptions = {
  headless: false,
  defaultViewport: null,
  args: []
};

if (proxy) {
  launchOptions.args.push(`--proxy-server=${proxy}`);
}

(async () => {
  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  // auth proxy jika perlu
  if (proxy && proxy.includes("@")) {
    const auth = proxy.split("@")[0].replace(/https?:\/\//, "");
    const [username, password] = auth.split(":");
    await page.authenticate({ username, password });
  }

  await page.goto("https://gamety.org/?pages=reg", {
    waitUntil: "networkidle2"
  });

  // ================= FORM =================
  const uid = Date.now();

  await page.type('input[name="login"]', `user${uid}`);
  await page.type('input[name="email"]', `user${uid}@gmail.com`);
  await page.type('input[name="pass"]', "Password123!");

  // ================= CAPTCHA =================
  const capImg = await page.$("#cap_img");
  await capImg.screenshot({ path: "captcha.png" });

  console.log("🧩 Captcha diambil");

  const {
    data: { text }
  } = await Tesseract.recognize("captcha.png", "eng", {
    tessedit_char_whitelist: "0123456789"
  });

  const captcha = text.replace(/\D/g, "").trim();
  console.log("🔍 OCR Result:", captcha);

  if (captcha.length !== 4) {
    console.log("❌ OCR gagal, hentikan");
    await browser.close();
    return;
  }

  await page.type('input[name="cap"]', captcha);

  // ================= SUBMIT =================
  await Promise.all([
    page.click('button[name="sub_reg"]'),
    page.waitForNavigation({ waitUntil: "networkidle2" })
  ]);

  console.log("📨 Form disubmit");

  // ================= RESULT CHECK =================
  const bodyText = await page.evaluate(() => document.body.innerText);

  if (bodyText.includes("successful")) {
    console.log("✅ REGISTER SUCCESS");
  } else if (bodyText.includes("captcha")) {
    console.log("❌ CAPTCHA SALAH");
  } else {
    console.log("⚠️ RESPONSE TIDAK DIKETAHUI");
  }

  await browser.close();
})();
