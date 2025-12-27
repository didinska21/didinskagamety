import puppeteer from "puppeteer";
import readline from "readline-sync";
import axios from "axios";
import fs from "fs";

/* ================= CONFIG ================= */
const TOTAL_ACCOUNT = 10;
const TARGET_URL = "https://gamety.org/?pages=reg";

// === PROXY (HTTP ROTATING – WAJIB FORMAT INI) ===
const PROXY_HOST = "na.proxys5.net:6200";
const PROXY_USER = "81634571-zone-custom-region-US-state-newyork";
const PROXY_PASS = "g93c7o0n";

/* ================= UTILS ================= */
async function checkIP(proxy) {
  try {
    const res = await axios.get("https://api.ipify.org", {
      proxy: {
        host: proxy.host,
        port: proxy.port,
        auth: {
          username: proxy.username,
          password: proxy.password
        }
      },
      timeout: 10000
    });
    return res.data;
  } catch {
    return null;
  }
}

/* ================= MAIN ================= */
(async () => {
  console.log("🚀 START AUTO REGISTER (ROTATING IP)");

  let lastIP = null;

  for (let i = 1; i <= TOTAL_ACCOUNT; i++) {
    console.log(`
==============================
👤 MEMBUAT AKUN KE-${i}
==============================`);

    /* ===== CHECK IP (ROTATING CONFIRM) ===== */
    const currentIP = await checkIP({
      host: "na.proxys5.net",
      port: 6200,
      username: PROXY_USER,
      password: PROXY_PASS
    });

    console.log("🌐 IP SAAT INI:", currentIP || "UNKNOWN");

    if (currentIP && currentIP === lastIP) {
      console.log("⚠️ IP BELUM BERUBAH → STOP (proxy belum rotate)");
      break;
    }

    lastIP = currentIP;

    /* ===== LAUNCH BROWSER (NEW SESSION) ===== */
    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: { width: 1366, height: 768 },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        `--proxy-server=http://${PROXY_HOST}`
      ]
    });

    const page = await browser.newPage();

    await page.authenticate({
      username: PROXY_USER,
      password: PROXY_PASS
    });

    /* ===== OPEN REGISTER PAGE ===== */
    await page.goto(TARGET_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    /* ===== WAIT FORM (ANTI CLOUDFLARE DELAY) ===== */
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

    /* ===== FILL USER ===== */
    const uid = Date.now() + i;
    const username = `user${uid}`;
    const email = `user${uid}@gmail.com`;
    const password = "Password123!";

    await page.type('#form input[name="login"]', username, { delay: 60 });
    await page.type('#form input[name="email"]', email, { delay: 60 });
    await page.type('#form input[name="pass"]', password, { delay: 60 });

    /* ===== CAPTCHA ===== */
    const captchaPath = `captcha/captcha${i}.png`;
    const capImg = await page.$("#cap_img");
    await capImg.screenshot({ path: captchaPath });

    console.log(`🧩 CAPTCHA disimpan: ${captchaPath}`);
    const captcha = readline.question("✍️ Masukkan captcha: ");

    await page.type('#form input[name="cap"]', captcha, { delay: 60 });

    /* ===== SUBMIT ===== */
    console.log("📨 Submit form...");
    await page.click('#form button[name="sub_reg"]');
    await new Promise(r => setTimeout(r, 2500));

    /* ===== SWEETALERT RESULT ===== */
    const swalText = await page.evaluate(() => {
      const el = document.querySelector(".swal-text");
      return el ? el.innerText : null;
    });

    if (swalText) {
      console.log("📣 SWEETALERT:", swalText);

      if (/success/i.test(swalText)) {
        console.log("✅ REGISTER SUCCESS");
        fs.appendFileSync(
          "akun_sukses.txt",
          `${username}|${email}|${password}|${currentIP}\n`
        );
      } else if (/IP address/i.test(swalText)) {
        console.log("🚫 IP LIMIT → STOP LOOP");
        await browser.close();
        break;
      } else {
        console.log("⚠️ REGISTER DITOLAK");
      }
    } else {
      console.log("⚠️ Tidak ada SweetAlert");
    }

    await browser.close();
    console.log("🧹 Browser ditutup (rotate IP next)");
  }

  console.log("\n🎉 SELESAI SEMUA PROSES");
})();
