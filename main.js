import fs from 'fs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

/* ================= CONFIG ================= */

const CONFIG = {
  baseUrl: 'https://gamety.org/?ref=218053',
  regUrl: 'https://gamety.org/?pages=reg',
  accounts: 10,
  delay: 8000,
  headless: true,
  slowMo: 80
};

/* ================= UTILS ================= */

const sleep = ms => new Promise(r => setTimeout(r, ms));

function rand(len) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return [...Array(len)].map(() => c[Math.floor(Math.random() * c.length)]).join('');
}

function genAccount() {
  return {
    username: `user_${rand(8)}`,
    email: `${rand(10)}@gmail.com`,
    password: `Pass${rand(6)}!23`
  };
}

function loadProxies() {
  if (!fs.existsSync('proxy.txt')) return [];
  return fs.readFileSync('proxy.txt','utf8')
    .split('\n').map(x=>x.trim()).filter(Boolean);
}

/* ================= BROWSER INIT (DIAM STYLE) ================= */

async function initBrowser(proxyUrl=null) {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--disable-blink-features=AutomationControlled'
  ];

  let proxyAuth = null;

  if (proxyUrl) {
    const m = proxyUrl.match(/^(https?|socks5):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)/);
    if (!m) throw new Error('Invalid proxy format');

    const [, proto, user, pass, host, port] = m;
    args.push(`--proxy-server=${proto}://${host}:${port}`);

    if (user && pass) {
      proxyAuth = { username: user, password: pass };
    }

    console.log(`🌐 Proxy: ${proto}://${host}:${port}`);
  }

  const browser = await puppeteer.launch({
    headless: CONFIG.headless ? 'new' : false,
    slowMo: CONFIG.slowMo,
    args,
    executablePath:
      fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' :
      fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' :
      undefined,
    ignoreHTTPSErrors: true
  });

  return { browser, proxyAuth };
}

/* ================= CLOUDFLARE WAIT ================= */

async function waitCF(page) {
  console.log('🛡️ Waiting Cloudflare...');
  try {
    await page.waitForFunction(
      () =>
        !document.title.includes('Just a moment') &&
        !document.body.innerText.includes('Checking your browser'),
      { timeout: 60000 }
    );
    console.log('✅ Cloudflare passed');
  } catch {
    console.log('⚠️ CF timeout, continue');
  }
}

/* ================= REGISTER ================= */

async function register(browser, proxyAuth, acc, idx) {
  let page;
  try {
    console.log(`\n🚀 [${idx}] ${acc.username}`);

    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    if (proxyAuth) {
      await page.authenticate(proxyAuth);
    }

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    /* Referral */
    await page.goto(CONFIG.baseUrl, { waitUntil:'networkidle0', timeout:60000 });
    await waitCF(page);

    /* Register page */
    await page.goto(CONFIG.regUrl, { waitUntil:'networkidle0', timeout:60000 });
    await waitCF(page);
    await sleep(3000);

    /* Fill */
    await page.evaluate(a => {
      const set = (q,v)=>{
        const i=document.querySelector(q);
        if(i){i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}))}
      };
      set('input[name*=login i],input[name*=user i]',a.username);
      set('input[type=email]',a.email);
      set('input[type=password]',a.password);
    }, acc);

    await sleep(1500);

    /* Submit */
    const ok = await page.evaluate(()=>{
      const b=[...document.querySelectorAll('button,input[type=submit]')]
        .find(x=>/register|create|sign/i.test(x.innerText||x.value));
      if(b){b.click();return true;}
      return false;
    });

    if(!ok) throw new Error('Submit not found');

    await sleep(6000);

    if (!page.url().includes('pages=reg')) {
      fs.appendFileSync(
        'registered_accounts.txt',
        `${acc.username}|${acc.email}|${acc.password}\n`
      );
      console.log('✅ SUCCESS');
      return true;
    }

    console.log('❌ FAILED');
    return false;

  } catch(e) {
    console.log('❌ ERROR:', e.message);
    if(page) await page.screenshot({ path:`err_${Date.now()}.png` });
    return false;
  } finally {
    if(page) await page.close();
  }
}

/* ================= MAIN ================= */

(async()=>{
  console.log('🎮 GAMETY AUTO REGISTER – DIAM STYLE\n');

  const proxies = loadProxies();
  const proxy = proxies.length ? proxies[0] : null;

  const { browser, proxyAuth } = await initBrowser(proxy);

  let ok = 0;
  for (let i=0;i<CONFIG.accounts;i++){
    if (await register(browser, proxyAuth, genAccount(), i+1)) ok++;
    if (i < CONFIG.accounts-1) await sleep(CONFIG.delay);
  }

  console.log(`\n📊 DONE: ${ok}/${CONFIG.accounts}`);
  await browser.close();
})();
