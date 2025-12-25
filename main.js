const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

/* ================= CONFIG ================= */

const CONFIG = {
  baseUrl: 'https://gamety.org/?ref=218053',
  regUrl: 'https://gamety.org/?pages=reg',
  proxyFile: 'proxy.txt',
  accountsToCreate: 10,
  delayBetweenRegistrations: 8000,
  cloudflareTimeout: 90000,
  headless: true, // ⬅️ WAJIB VPS
};

/* ================= UTILS ================= */

const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadProxies() {
  const file = path.join(__dirname, CONFIG.proxyFile);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8')
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean);
}

function randomString(len) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return [...Array(len)].map(() => c[Math.floor(Math.random() * c.length)]).join('');
}

function generateAccount() {
  return {
    username: `user_${randomString(8)}`,
    email: `${randomString(10)}@gmail.com`,
    password: `Pass${randomString(6)}!23`
  };
}

/* ================= CLOUDFLARE WAIT ================= */

async function waitCloudflare(page, timeout = 90000) {
  const start = Date.now();
  console.log('🛡️ Menunggu Cloudflare...');

  while (Date.now() - start < timeout) {
    try {
      const ok = await page.evaluate(() => {
        const t = document.title.toLowerCase();
        const b = document.body.innerText.toLowerCase();
        return !(
          t.includes('just a moment') ||
          b.includes('checking your browser') ||
          b.includes('verifying you are human')
        );
      });

      if (ok) {
        console.log('✅ Cloudflare lolos');
        return true;
      }
    } catch {}
    await sleep(2000);
  }

  console.log('⚠️ Cloudflare timeout');
  return false;
}

/* ================= REGISTER ================= */

async function register(account, proxy) {
  let browser, page;

  try {
    console.log(`\n🚀 Register: ${account.username}`);

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ];

    if (proxy) {
      const clean = proxy.replace(/^https?:\/\//, '');
      args.push(`--proxy-server=${clean}`);
      console.log(`🌐 Proxy: ${clean}`);
    }

    browser = await puppeteer.launch({
      headless: 'new',
      args,
    });

    page = await browser.newPage();

    if (proxy && proxy.includes('@')) {
      const [, auth] = proxy.split('://');
      const [cred] = auth.split('@');
      const [username, password] = cred.split(':');
      await page.authenticate({ username, password });
    }

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    /* Referral */
    await page.goto(CONFIG.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitCloudflare(page);

    /* Registration */
    await page.goto(CONFIG.regUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitCloudflare(page);

    await sleep(4000);

    const hasForm = await page.$('input');
    if (!hasForm) throw new Error('Form tidak ditemukan (masih CF?)');

    /* Fill form */
    await page.evaluate(({ u, e, p }) => {
      const set = (sel, val) => {
        const i = document.querySelector(sel);
        if (i) {
          i.focus();
          i.value = val;
          i.dispatchEvent(new Event('input', { bubbles: true }));
        }
      };

      set('input[name*=login i],input[name*=user i]', u);
      set('input[type=email]', e);
      set('input[type=password]', p);
    }, {
      u: account.username,
      e: account.email,
      p: account.password
    });

    await sleep(1500);

    /* Submit */
    const submitted = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button,input[type=submit]')]
        .find(b => /register|create|sign/i.test(b.innerText || b.value));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (!submitted) throw new Error('Submit gagal');

    await sleep(6000);

    const url = page.url();
    const ok = !url.includes('pages=reg');

    if (ok) {
      fs.appendFileSync(
        'registered_accounts.txt',
        `${account.username}|${account.email}|${account.password}|${proxy || 'no-proxy'}\n`
      );
      console.log('✅ SUCCESS');
    } else {
      console.log('❌ FAILED');
    }

    return ok;

  } catch (e) {
    console.log('❌ ERROR:', e.message);
    return false;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/* ================= MAIN ================= */

(async () => {
  console.log('🎮 GAMETY AUTO REGISTER – VPS SAFE');
  console.log('='.repeat(50));

  const proxies = loadProxies();
  let success = 0;

  for (let i = 0; i < CONFIG.accountsToCreate; i++) {
    const acc = generateAccount();
    const proxy = proxies.length ? proxies[i % proxies.length] : null;

    if (await register(acc, proxy)) success++;
    if (i < CONFIG.accountsToCreate - 1) {
      console.log(`⏱️ Delay ${CONFIG.delayBetweenRegistrations / 1000}s`);
      await sleep(CONFIG.delayBetweenRegistrations);
    }
  }

  console.log('\n📊 DONE');
  console.log(`✅ Success: ${success}`);
  console.log(`❌ Failed: ${CONFIG.accountsToCreate - success}`);
})();
