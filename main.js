const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Konfigurasi
const CONFIG = {
  baseUrl: 'https://gamety.org/?ref=218053',
  proxyFile: 'proxy.txt', // File yang berisi list proxy
  accountsToCreate: 10, // Jumlah akun yang akan dibuat
  delayBetweenRegistrations: 5000, // Delay antar registrasi (ms)
};

// Membaca proxy dari file
function loadProxies() {
  try {
    const proxyFile = path.join(__dirname, CONFIG.proxyFile);
    
    if (!fs.existsSync(proxyFile)) {
      console.log('⚠️  File proxy.txt tidak ditemukan, akan berjalan tanpa proxy');
      return [];
    }

    const content = fs.readFileSync(proxyFile, 'utf-8');
    const proxies = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')); // Ignore empty lines dan comments

    console.log(`✅ Berhasil load ${proxies.length} proxy dari ${CONFIG.proxyFile}`);
    return proxies;
  } catch (error) {
    console.error('❌ Error membaca file proxy:', error.message);
    return [];
  }
}

// Parse proxy URL (support http, https, socks5)
function parseProxyUrl(proxyUrl) {
  try {
    // Format: protocol://username:password@host:port
    // Contoh: http://81634571-zone-custom-region-US:g93c7o0n@na.proxys5.net:6200
    
    const url = new URL(proxyUrl);
    
    return {
      protocol: url.protocol.replace(':', ''), // http, https, socks5
      host: url.hostname,
      port: url.port,
      username: url.username || null,
      password: url.password || null,
      fullUrl: proxyUrl,
    };
  } catch (error) {
    console.error(`❌ Error parsing proxy URL: ${proxyUrl}`, error.message);
    return null;
  }
}

// Generator data random
function generateRandomData() {
  const randomString = (length) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const username = `user_${randomString(8)}`;
  const email = `${randomString(10)}@gmail.com`;
  const password = `Pass${randomString(8)}123!`;
  const number = Math.floor(Math.random() * 9000000000) + 1000000000; // 10 digit number

  return { username, email, password, number };
}

// Fungsi untuk mendapatkan proxy berikutnya (rotating)
let currentProxyIndex = 0;
let proxyList = [];

function getNextProxy() {
  if (proxyList.length === 0) return null;
  
  const proxyUrl = proxyList[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxyList.length;
  
  return parseProxyUrl(proxyUrl);
}

// Fungsi untuk solve CAPTCHA menggunakan OCR
async function solveCaptcha(page) {
  try {
    console.log('🔍 Mencari CAPTCHA image...');
    
    // Tunggu captcha image muncul - coba beberapa selector
    const captchaSelectors = [
      'img[src*="captcha"]',
      'img[src*="Captcha"]',
      'img[src*="CAPTCHA"]',
      'img[alt*="captcha"]',
      '.captcha img',
      '#captcha img',
    ];

    let captchaElement = null;
    for (const selector of captchaSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 2000 });
        captchaElement = await page.$(selector);
        if (captchaElement) {
          console.log(`✅ CAPTCHA ditemukan dengan selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!captchaElement) {
      console.log('⚠️  CAPTCHA element tidak ditemukan, mencoba lanjut tanpa CAPTCHA...');
      return '';
    }

    // Screenshot captcha untuk OCR
    const captchaImage = await captchaElement.screenshot();
    
    // Menggunakan Tesseract.js untuk OCR
    const Tesseract = require('tesseract.js');
    
    console.log('🤖 Memproses CAPTCHA dengan OCR...');
    const { data: { text } } = await Tesseract.recognize(captchaImage, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          process.stdout.write(`\r   Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    
    console.log(''); // New line after progress
    
    // Bersihkan hasil OCR (ambil hanya angka dan huruf)
    let captchaText = text.replace(/[^a-zA-Z0-9]/g, '').trim();
    
    // Jika hanya angka yang dibutuhkan
    const numbersOnly = text.replace(/[^0-9]/g, '').trim();
    if (numbersOnly.length >= 3) {
      captchaText = numbersOnly;
    }
    
    console.log(`🔐 CAPTCHA terdeteksi: "${captchaText}"`);
    
    return captchaText;
  } catch (error) {
    console.error('❌ Error solving captcha:', error.message);
    return '';
  }
}

// Fungsi utama untuk registrasi
async function registerAccount(accountData, proxyConfig) {
  let browser = null;
  
  try {
    console.log('\n' + '='.repeat(60));
    console.log(`🚀 Memulai registrasi akun: ${accountData.username}`);
    console.log('='.repeat(60));

    // Setup browser dengan proxy
    const launchOptions = {
      headless: 'new', // Gunakan headless mode untuk server tanpa GUI
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-dev-shm-usage', // Untuk server dengan RAM terbatas
        '--disable-gpu',
      ],
    };

    if (proxyConfig) {
      // Support untuk HTTP, HTTPS, dan SOCKS5
      if (proxyConfig.protocol === 'socks5') {
        launchOptions.args.push(`--proxy-server=socks5://${proxyConfig.host}:${proxyConfig.port}`);
      } else {
        launchOptions.args.push(`--proxy-server=${proxyConfig.protocol}://${proxyConfig.host}:${proxyConfig.port}`);
      }
      console.log(`🌐 Menggunakan proxy: ${proxyConfig.protocol}://${proxyConfig.host}:${proxyConfig.port}`);
    } else {
      console.log('🌐 Berjalan tanpa proxy');
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Authenticate proxy jika ada username/password
    if (proxyConfig && proxyConfig.username && proxyConfig.password) {
      await page.authenticate({
        username: proxyConfig.username,
        password: proxyConfig.password,
      });
      console.log('🔐 Proxy authentication berhasil');
    }

    // Set user agent untuk menghindari deteksi bot
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set viewport
    await page.setViewport({ width: 1366, height: 768 });

    // Buka halaman utama
    console.log('📄 Membuka halaman...');
    await page.goto(CONFIG.baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Screenshot untuk debugging
    // await page.screenshot({ path: `debug_${Date.now()}_1_homepage.png` });

    // Klik tombol "Create an account" di pojok kanan atas
    console.log('🖱️  Mencari tombol Create an account...');
    
    await page.waitForTimeout(2000); // Tunggu page fully loaded
    
    const createAccountClicked = await page.evaluate(() => {
      // Cari berdasarkan text
      const buttons = Array.from(document.querySelectorAll('a, button, div[onclick]'));
      const createBtn = buttons.find(btn => {
        const text = btn.textContent.toLowerCase();
        return text.includes('create an account') || 
               text.includes('create account') ||
               text.includes('register');
      });
      
      if (createBtn) {
        createBtn.click();
        return true;
      }
      
      // Cari berdasarkan href
      const link = document.querySelector('a[href*="pages=reg"]');
      if (link) {
        link.click();
        return true;
      }
      
      return false;
    });

    if (!createAccountClicked) {
      // Coba navigasi langsung
      console.log('⚠️  Tombol tidak ditemukan, navigasi langsung ke halaman registrasi...');
      await page.goto('https://gamety.org/?pages=reg', { waitUntil: 'networkidle2', timeout: 30000 });
    } else {
      console.log('✅ Tombol Create an account diklik');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    }

    await page.waitForTimeout(2000);
    // await page.screenshot({ path: `debug_${Date.now()}_2_regpage.png` });

    // Tunggu form registrasi muncul
    console.log('⏳ Menunggu form registrasi...');
    
    // Coba beberapa selector untuk input login
    const loginSelectors = [
      'input[placeholder*="Login"]',
      'input[placeholder*="login"]',
      'input[name*="login"]',
      'input[name="login"]',
      'input#login',
    ];

    let loginInput = null;
    for (const selector of loginSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        loginInput = await page.$(selector);
        if (loginInput) break;
      } catch (e) {
        continue;
      }
    }

    if (!loginInput) {
      throw new Error('Form registrasi tidak ditemukan');
    }

    // Isi form registrasi
    console.log('✍️  Mengisi form registrasi...');
    
    // Login/Username
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      inputs.forEach(input => input.value = '');
    });
    
    await page.waitForTimeout(500);
    
    // Login
    const loginField = await page.$('input[placeholder*="Login"], input[name*="login"]');
    if (loginField) {
      await loginField.click({ clickCount: 3 });
      await loginField.type(accountData.username, { delay: 100 });
      console.log(`   ✓ Username: ${accountData.username}`);
    }

    await page.waitForTimeout(500);

    // Email
    const emailField = await page.$('input[placeholder*="Email"], input[type="email"], input[name*="email"]');
    if (emailField) {
      await emailField.click({ clickCount: 3 });
      await emailField.type(accountData.email, { delay: 100 });
      console.log(`   ✓ Email: ${accountData.email}`);
    }

    await page.waitForTimeout(500);

    // Password
    const passwordField = await page.$('input[placeholder*="Password"], input[type="password"], input[name*="password"]');
    if (passwordField) {
      await passwordField.click({ clickCount: 3 });
      await passwordField.type(accountData.password, { delay: 100 });
      console.log(`   ✓ Password: ${accountData.password}`);
    }

    await page.waitForTimeout(500);

    // Number
    const numberField = await page.$('input[placeholder*="Number"], input[name*="number"]');
    if (numberField) {
      await numberField.click({ clickCount: 3 });
      await numberField.type(accountData.number.toString(), { delay: 100 });
      console.log(`   ✓ Number: ${accountData.number}`);
    }

    await page.waitForTimeout(1000);

    // Solve CAPTCHA
    console.log('🔐 Menyelesaikan CAPTCHA...');
    const captchaAnswer = await solveCaptcha(page);
    
    if (captchaAnswer) {
      // Isi CAPTCHA
      const captchaInputSelectors = [
        'input[name*="captcha"]',
        'input[placeholder*="captcha"]',
        'input[name*="code"]',
        'input[placeholder*="code"]',
      ];

      for (const selector of captchaInputSelectors) {
        const captchaInput = await page.$(selector);
        if (captchaInput) {
          await captchaInput.click({ clickCount: 3 });
          await captchaInput.type(captchaAnswer, { delay: 100 });
          console.log(`   ✓ CAPTCHA: ${captchaAnswer}`);
          break;
        }
      }
    }

    await page.waitForTimeout(1000);
    // await page.screenshot({ path: `debug_${Date.now()}_3_filled.png` });

    // Submit form
    console.log('📤 Mengirim form registrasi...');
    
    const submitClicked = await page.evaluate(() => {
      // Cari tombol submit
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      const submitBtn = buttons.find(btn => {
        const text = btn.textContent.toLowerCase() || btn.value?.toLowerCase() || '';
        return text.includes('create') || 
               text.includes('register') || 
               text.includes('submit') ||
               text.includes('sign up');
      });
      
      if (submitBtn) {
        submitBtn.click();
        return true;
      }
      return false;
    });

    if (!submitClicked) {
      throw new Error('Tombol submit tidak ditemukan');
    }
    
    // Tunggu response
    await page.waitForTimeout(5000);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    
    // await page.screenshot({ path: `debug_${Date.now()}_4_result.png` });
    
    // Cek apakah registrasi berhasil
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    const pageContent = await page.content().catch(() => '');

    // Cek berbagai indikator sukses/gagal
    const successIndicators = [
      !currentUrl.includes('pages=reg'),
      !pageContent.toLowerCase().includes('error'),
      !pageContent.toLowerCase().includes('failed'),
      !pageContent.toLowerCase().includes('invalid'),
      !pageContent.toLowerCase().includes('wrong'),
      pageContent.toLowerCase().includes('success') ||
      pageContent.toLowerCase().includes('welcome') ||
      pageContent.toLowerCase().includes('account created'),
    ];

    const isSuccess = successIndicators.filter(Boolean).length >= 3;

    // Simpan hasil
    const result = {
      success: isSuccess,
      username: accountData.username,
      email: accountData.email,
      password: accountData.password,
      number: accountData.number,
      proxy: proxyConfig ? `${proxyConfig.protocol}://${proxyConfig.host}:${proxyConfig.port}` : 'No proxy',
      timestamp: new Date().toISOString(),
    };

    if (result.success) {
      console.log('✅ Registrasi BERHASIL!');
      saveAccount(result);
    } else {
      console.log('❌ Registrasi GAGAL! (Mungkin CAPTCHA salah atau data invalid)');
    }

    return result;

  } catch (error) {
    console.error('❌ Error:', error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Simpan akun yang berhasil dibuat
function saveAccount(accountData) {
  const filename = 'registered_accounts.txt';
  const data = `Username: ${accountData.username} | Email: ${accountData.email} | Password: ${accountData.password} | Number: ${accountData.number} | Proxy: ${accountData.proxy} | Time: ${accountData.timestamp}\n`;
  
  fs.appendFileSync(filename, data);
  console.log(`💾 Akun disimpan ke ${filename}`);
}

// Main function
async function main() {
  console.log('🎮 GAMETY.ORG AUTO REGISTER');
  console.log('='.repeat(60));
  
  // Load proxies dari file
  proxyList = loadProxies();
  
  console.log(`📊 Target: ${CONFIG.accountsToCreate} akun`);
  console.log(`🌐 Proxy: ${proxyList.length > 0 ? proxyList.length + ' proxy (rotating)' : 'Tanpa proxy'}`);
  console.log('='.repeat(60));

  const results = {
    success: 0,
    failed: 0,
  };

  for (let i = 0; i < CONFIG.accountsToCreate; i++) {
    console.log(`\n📍 Progress: ${i + 1}/${CONFIG.accountsToCreate}`);
    
    const accountData = generateRandomData();
    const proxyConfig = getNextProxy();
    
    const result = await registerAccount(accountData, proxyConfig);
    
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
    }

    // Delay sebelum registrasi berikutnya
    if (i < CONFIG.accountsToCreate - 1) {
      console.log(`⏱️  Menunggu ${CONFIG.delayBetweenRegistrations / 1000} detik sebelum registrasi berikutnya...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRegistrations));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Berhasil: ${results.success}`);
  console.log(`❌ Gagal: ${results.failed}`);
  console.log(`📈 Success Rate: ${((results.success / CONFIG.accountsToCreate) * 100).toFixed(2)}%`);
  console.log(`📁 Akun tersimpan di: registered_accounts.txt`);
  console.log('='.repeat(60));
}

// Jalankan script
main().catch(console.error);
