import puppeteer from "puppeteer";
import fs from "fs";
import readline from "readline-sync";

/* ================= CONFIG ================= */
const TOTAL_ACCOUNT = 1; // jumlah akun
const TARGET_URL = "https://gamety.org/?pages=reg";

/* ================= MENU ================= */
console.log(`
==============================
 AUTO REGISTER BOT (MANUAL CAPTCHA)
==============================
1. Tanpa Proxy
2. Proxy Statis (HTTP only)
==============================
`);

const choice = readline.question("Pilih mode (1/2): ");
let proxy = null;

if (choice === "2") {
  proxy = readline.question("Masukkan proxy HTTP (http://user:pass@ip:port): ");
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

if (proxy) {
  launchOptions.args.push(`--proxy-server=${proxy}`);
}

/* ================= MAIN ================= */
(async () => {
  console.log("🚀 Launching browser...");
  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  // HTTP proxy auth (jika ada)
  if (proxy && proxy.includes("@")) {
    const authPart = proxy.split("@")[0].replace(/^http:\/\//, "");
    const [username, password] = authPart.split(":");
    await page.authenticate({ username, password });
  }

  for (let i = 1; i <= TOTAL_ACCOUNT; i++) {
    console.log(`
==============================
👤 MEMBUAT AKUN KE-${i}
==============================`);

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

    /* ===== CLEAR FORM ===== */
    await page.evaluate(() => {
      document.querySelector('#form input[name="login"]').value = "";
      document.querySelector('#form input[name="email"]').value = "";
      document.querySelector('#form input[name="pass"]').value = "";
      document.querySelector('#form input[name="cap"]').value = "";
    });

    /* ===== FILL USER DATA ===== */
    const uid = Date.now() + i;
    const username = `user${uid}`;
    const email = `user${uid}@gmail.com`;
    const password = "Password123!";

    await page.type('#form input[name="login"]', username, { delay: 60 });
    await page.type('#form input[name="email"]', email, { delay: 60 });
    await page.type('#form input[name="pass"]', password, { delay: 60 });

    /* ===== CAPTCHA SAVE ===== */
    const capImg = await page.$("#cap_img");
    if (!capImg) {
      console.log("❌ CAPTCHA tidak ditemukan");
      continue;
    }

    const captchaPath = `captcha/captcha${i}.png`;
    await capImg.screenshot({ path: captchaPath });
    console.log(`🧩 CAPTCHA disimpan: ${captchaPath}`);
    console.log(`👉 Buka file ${captchaPath}`);

    /* ===== MANUAL CAPTCHA INPUT ===== */
    const captchaValue = readline.question("✍️ Masukkan captcha: ");
    await page.type('#form input[name="cap"]', captchaValue, { delay: 60 });

    /* ===== SUBMIT ===== */
    console.log("📨 Submit form...");
    await Promise.all([
      page.click('#form button[name="sub_reg"]'),
      page.waitForTimeout(2000) // tunggu swal muncul
    ]);

    /* ===== SWEETALERT RESULT ===== */
    const swalText = await page.evaluate(() => {
      const el = document.querySelector(".swal-text");
      return el ? el.innerText : null;
    });

    if (swalText) {
      console.log(`📣 SWEETALERT: ${swalText}`);

      if (/success/i.test(swalText)) {
        console.log(`✅ AKUN KE-${i} BERHASIL`);
        fs.appendFileSync(
          "akun_sukses.txt",
          `${username}|${email}|${password}\n`
        );
      } else if (/captcha/i.test(swalText)) {
        console.log(`❌ CAPTCHA SALAH`);
      } else if (/disabled|duplicate|country/i.test(swalText)) {
        console.log(`🚫 REGISTRATION DITOLAK`);
        break;
      } else {
        console.log(`⚠️ PESAN TIDAK DIKENAL`);
      }
    } else {
      console.log("⚠️ Tidak ada SweetAlert terdeteksi");
    }
  }

  await browser.close();
  console.log("\n🎉 SEMUA PROSES SELESAI");
})();
