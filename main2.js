import puppeteer from "puppeteer";
import Tesseract from "tesseract.js";
import sharp from "sharp";
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

/* ================= PREPROCESS CAPTCHA (IMPROVED) ================= */
async function preprocessCaptcha() {
  // Preprocessing lebih agresif untuk captcha yang sulit
  await sharp("captcha.png")
    .resize(400, 150, { fit: "inside", kernel: "lanczos3" })
    .normalize() // Auto-adjust contrast
    .grayscale()
    .linear(1.5, -(128 * 1.5) + 128) // Increase contrast
    .median(2) // Remove noise
    .threshold(128) // Binarize
    .toFile("captcha_clean.png");
}

/* ================= MULTIPLE OCR ATTEMPTS ================= */
async function recognizeCaptcha() {
  const configs = [
    { psm: 7, threshold: 128 },  // Single line
    { psm: 8, threshold: 128 },  // Single word
    { psm: 13, threshold: 100 }, // Raw line
    { psm: 6, threshold: 150 },  // Block of text
  ];

  for (const config of configs) {
    try {
      // Try different preprocessing
      await sharp("captcha.png")
        .resize(400, 150, { fit: "inside" })
        .normalize()
        .grayscale()
        .threshold(config.threshold)
        .toFile("captcha_temp.png");

      const { data: { text } } = await Tesseract.recognize(
        "captcha_temp.png",
        "eng",
        {
          tessedit_char_whitelist: "0123456789",
          psm: config.psm
        }
      );

      const result = text.replace(/\D/g, "").trim();
      
      if (result.length === 4) {
        console.log(`✅ OCR Success (PSM ${config.psm}):`, result);
        return result;
      } else if (result.length > 0) {
        console.log(`⚠️ OCR Partial (PSM ${config.psm}): "${result}" (len: ${result.length})`);
      }
    } catch (err) {
      console.log(`❌ OCR Error (PSM ${config.psm}):`, err.message);
    }
  }

  return null;
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

  // Proxy auth (jika ada)
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

  /* ===== WAIT FORM ===== */
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

  /* ===== FILL FORM ===== */
  const uid = Date.now();
  await page.type('#form input[name="login"]', `user${uid}`, { delay: 80 });
  await page.type('#form input[name="email"]', `user${uid}@gmail.com`, { delay: 80 });
  await page.type('#form input[name="pass"]', "Password123!", { delay: 80 });
  console.log("✍️ Data user diisi");

  /* ===== CAPTCHA (IMPROVED) ===== */
  const capImg = await page.$("#cap_img");
  if (!capImg) {
    console.log("❌ CAPTCHA image tidak ditemukan");
    await browser.close();
    return;
  }

  // Screenshot dengan padding lebih besar
  await capImg.screenshot({ 
    path: "captcha.png",
    type: "png"
  });
  console.log("🧩 captcha.png disimpan");

  // Try multiple OCR methods
  const captcha = await recognizeCaptcha();

  if (!captcha || captcha.length !== 4) {
    console.log("❌ OCR captcha gagal setelah semua percobaan");
    console.log("💡 TIP: Cek file captcha.png dan captcha_clean.png secara manual");
    console.log("💡 Jika captcha terlalu blur/kompleks, pertimbangkan pakai 2captcha API");
    await browser.close();
    return;
  }

  await page.type('#form input[name="cap"]', captcha, { delay: 80 });

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

  if (/success|successful|berhasil/i.test(bodyText)) {
    console.log("✅ REGISTER SUCCESS");
    console.log("📝 Username: user" + uid);
    console.log("📧 Email: user" + uid + "@gmail.com");
  } else if (/captcha|kode/i.test(bodyText)) {
    console.log("❌ CAPTCHA SALAH");
  } else if (/disabled|ditutup/i.test(bodyText)) {
    console.log("🚫 REGISTRATION DISABLED");
  } else {
    console.log("⚠️ RESPONSE TIDAK DIKENALI");
    console.log("📄 Body preview:", bodyText.substring(0, 200));
  }

  // Cleanup
  await browser.close();
  
  // Hapus file temporary
  try {
    if (fs.existsSync("captcha_temp.png")) fs.unlinkSync("captcha_temp.png");
  } catch (e) {}
})();
