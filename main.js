const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

// Konfigurasi
const CONFIG = {
  baseUrl: 'https://gamety.org/?ref=218053',
  regUrl: 'https://gamety.org/?pages=reg',
  proxyFile: 'proxy.txt',
  accountsToCreate: 10,
  delayBetweenRegistrations: 8000,
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
      .filter(line => line && !line.startsWith('#'));

    console.log(`✅ Berhasil load ${proxies.length} proxy dari ${CONFIG.proxyFile}`);
    return proxies;
  } catch (error) {
    console.error('❌ Error membaca file proxy:', error.message);
    return [];
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

  return { username, email, password };
}

// Rotating proxy
let currentProxyIndex = 0;
let proxyList = [];

function getNextProxy() {
  if (proxyList.length === 0) return null;
  
  const proxy = proxyList[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxyList.length;
  
  return proxy;
}

// Extract captcha number dari HTML
async function getCaptchaNumber(page) {
  try {
    console.log('🔍 Mencari captcha number...');
    
    const captchaNumber = await page.evaluate(() => {
      // Method 1: Cari di text content
      const allText = document.body.innerText;
      const numberMatch = allText.match(/Number[:\s]*(\d{4,})/i);
      if (numberMatch) {
        return numberMatch[1];
      }
      
      // Method 2: Cari di dekat input Number
      const numberInput = document.querySelector('input[placeholder*="Number"], input[name*="number"]');
      if (numberInput) {
        const parent = numberInput.parentElement;
        const siblings = Array.from(parent.children);
        
        for (const sibling of siblings) {
          const text = sibling.innerText || sibling.textContent || '';
          const match = text.match(/\d{4,}/);
          if (match) {
            return match[0];
          }
        }
      }
      
      // Method 3: Cari semua angka 4+ digit di page
      const allNumbers = allText.match(/\b\d{4,}\b/g);
      if (allNumbers && allNumbers.length > 0) {
        return allNumbers.reduce((a, b) => a.length > b.length ? a : b);
      }
      
      return null;
    });
    
    if (captchaNumber) {
      console.log(`✅ Captcha ditemukan: ${captchaNumber}`);
      return captchaNumber;
    } else {
      console.log('⚠️  Captcha tidak ditemukan');
      return '';
    }
  } catch (error) {
    console.error('❌ Error getting captcha:', error.message);
    return '';
  }
}

// Fungsi utama untuk registrasi
async function registerAccount(accountData, proxyUrl) {
  let browser = null;
  let page = null;
  
  try {
    console.log('\n' + '='.repeat(60));
    console.log(`🚀 Memulai registrasi akun: ${accountData.username}`);
    console.log('='.repeat(60));

    // Setup real browser dengan konfigurasi yang diperbaiki
    const connectOptions = {
      headless: 'auto', // Ubah ke 'auto' untuk kompatibilitas lebih baik
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
      ],
      turnstile: true,
      connectOption: {
        defaultViewport: {
          width: 1920,
          height: 1080
        },
      },
      disableXvfb: false, // Ubah ke false
      ignoreAllFlags: false,
      customConfig: {},
      // Tambahkan executablePath jika Chrome tidak terdeteksi
      // executablePath: '/usr/bin/google-chrome', // Uncomment jika perlu
    };

    // Add proxy jika ada
    if (proxyUrl) {
      connectOptions.args.push(`--proxy-server=${proxyUrl}`);
      console.log(`🌐 Menggunakan proxy: ${proxyUrl}`);
    } else {
      console.log('🌐 Berjalan tanpa proxy');
    }

    console.log('🌐 Menginisialisasi real browser...');
    
    // Tambahkan timeout dan error handling yang lebih baik
    let response;
    try {
      response = await Promise.race([
        connect(connectOptions),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Browser startup timeout')), 60000)
        )
      ]);
    } catch (error) {
      console.error('❌ Error saat connect browser:', error.message);
      
      // Coba lagi tanpa proxy jika error terkait proxy
      if (proxyUrl && error.message.includes('ECONNREFUSED')) {
        console.log('⚠️  Mencoba lagi tanpa proxy...');
        connectOptions.args = connectOptions.args.filter(arg => !arg.includes('--proxy-server'));
        response = await connect(connectOptions);
      } else {
        throw error;
      }
    }
    
    browser = response.browser;
    page = response.page;

    console.log('✅ Real browser berhasil diinisialisasi');

    // Set extra headers untuk bypass detection
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Buka halaman referral dulu
    console.log('📄 Membuka halaman referral...');
    try {
      await page.goto(CONFIG.baseUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
    } catch (error) {
      console.log('⚠️  Timeout saat load referral page, melanjutkan...');
    }
    
    console.log('⏳ Menunggu halaman load...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Navigate ke halaman registrasi
    console.log('📄 Membuka halaman registrasi...');
    try {
      await page.goto(CONFIG.regUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
    } catch (error) {
      console.log('⚠️  Timeout saat load registration page, melanjutkan...');
    }
    
    console.log('⏳ Menunggu form registrasi load...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check apakah form ada
    const formDetected = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      return inputs.length > 0;
    });

    if (!formDetected) {
      throw new Error('Form registrasi tidak ditemukan');
    }

    console.log('✅ Form registrasi ditemukan!');

    // Screenshot untuk debug
    await page.screenshot({ path: 'registration_form.png', fullPage: true });
    console.log('📸 Screenshot disimpan: registration_form.png');

    // Get captcha number
    const captchaNumber = await getCaptchaNumber(page);

    // Isi form registrasi
    console.log('✏️  Mengisi form registrasi...');
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Isi dengan evaluate untuk lebih reliable
    const fillSuccess = await page.evaluate((data, captcha) => {
      try {
        // Login/Username
        const loginInput = document.querySelector('input[placeholder*="Login"], input[name*="login"], input[name*="username"]');
        if (loginInput) {
          loginInput.value = data.username;
          loginInput.dispatchEvent(new Event('input', { bubbles: true }));
          loginInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Email
        const emailInput = document.querySelector('input[placeholder*="Email"], input[type="email"], input[name*="email"]');
        if (emailInput) {
          emailInput.value = data.email;
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Password
        const passwordInput = document.querySelector('input[placeholder*="Password"], input[type="password"], input[name*="password"]');
        if (passwordInput) {
          passwordInput.value = data.password;
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Number/Captcha
        if (captcha) {
          const numberInput = document.querySelector('input[placeholder*="Number"], input[name*="number"], input[name*="captcha"]');
          if (numberInput) {
            numberInput.value = captcha;
            numberInput.dispatchEvent(new Event('input', { bubbles: true }));
            numberInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        return true;
      } catch (e) {
        console.error('Error filling form:', e);
        return false;
      }
    }, accountData, captchaNumber);

    if (fillSuccess) {
      console.log(`   ✓ Username: ${accountData.username}`);
      console.log(`   ✓ Email: ${accountData.email}`);
      console.log(`   ✓ Password: ${accountData.password}`);
      if (captchaNumber) {
        console.log(`   ✓ Captcha: ${captchaNumber}`);
      }
    } else {
      throw new Error('Gagal mengisi form');
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Screenshot form terisi
    await page.screenshot({ path: 'form_filled.png', fullPage: true });
    console.log('📸 Screenshot form terisi: form_filled.png');

    // Submit form
    console.log('📤 Mengirim form registrasi...');
    
    const submitSuccess = await page.evaluate(() => {
      // Cari tombol submit
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a[onclick]'));
      const submitBtn = buttons.find(btn => {
        const text = (btn.textContent || btn.value || '').toLowerCase();
        return text.includes('create') || 
               text.includes('register') || 
               text.includes('submit') ||
               text.includes('sign up') ||
               text.includes('daftar');
      });
      
      if (submitBtn) {
        submitBtn.click();
        return true;
      }
      
      // Coba submit form secara langsung
      const form = document.querySelector('form');
      if (form) {
        form.submit();
        return true;
      }
      
      return false;
    });

    if (!submitSuccess) {
      throw new Error('Tombol submit tidak ditemukan');
    }
    
    console.log('✅ Form berhasil di-submit!');
    
    // Tunggu response
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Screenshot hasil
    await page.screenshot({ path: 'after_submit.png', fullPage: true });
    console.log('📸 Screenshot hasil: after_submit.png');
    
    // Cek hasil
    const currentUrl = page.url();
    const pageContent = await page.content().catch(() => '');
    
    // Indikator sukses
    const isSuccess = 
      !currentUrl.includes('pages=reg') &&
      !pageContent.toLowerCase().includes('error') &&
      !pageContent.toLowerCase().includes('failed') &&
      !pageContent.toLowerCase().includes('invalid');

    // Simpan hasil
    const result = {
      success: isSuccess,
      username: accountData.username,
      email: accountData.email,
      password: accountData.password,
      captcha: captchaNumber,
      proxy: proxyUrl || 'No proxy',
      timestamp: new Date().toISOString(),
      finalUrl: currentUrl,
    };

    if (result.success) {
      console.log('✅ Registrasi BERHASIL!');
      console.log(`   Final URL: ${currentUrl}`);
      saveAccount(result);
    } else {
      console.log('❌ Registrasi GAGAL!');
      console.log(`   Final URL: ${currentUrl}`);
    }

    return result;

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Screenshot error jika page ada
    if (page) {
      try {
        await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
        console.log('📸 Error screenshot: error_screenshot.png');
      } catch (e) {
        // Ignore screenshot error
      }
    }
    
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.log('⚠️  Error closing browser:', e.message);
      }
    }
  }
}

// Simpan akun
function saveAccount(accountData) {
  const filename = 'registered_accounts.txt';
  const data = `Username: ${accountData.username} | Email: ${accountData.email} | Password: ${accountData.password} | Captcha: ${accountData.captcha} | Proxy: ${accountData.proxy} | Time: ${accountData.timestamp} | URL: ${accountData.finalUrl}\n`;
  
  fs.appendFileSync(filename, data);
  console.log(`💾 Akun disimpan ke ${filename}`);
}

// Main function
async function main() {
  console.log('🎮 GAMETY.ORG AUTO REGISTER (Real Browser Method)');
  console.log('='.repeat(60));
  
  proxyList = loadProxies();
  
  console.log(`📊 Target: ${CONFIG.accountsToCreate} akun`);
  console.log(`🌐 Proxy: ${proxyList.length > 0 ? proxyList.length + ' proxy (rotating)' : 'Tanpa proxy'}`);
  console.log('='.repeat(60));

  const results = {
    success: 0,
    failed: 0,
  };

  for (let i = 0; i < CONFIG.accountsToCreate; i++) {
    console.log(`\n🔢 Progress: ${i + 1}/${CONFIG.accountsToCreate}`);
    
    const accountData = generateRandomData();
    const proxyUrl = getNextProxy();
    
    const result = await registerAccount(accountData, proxyUrl);
    
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
    }

    // Delay sebelum registrasi berikutnya
    if (i < CONFIG.accountsToCreate - 1) {
      console.log(`⏱️  Menunggu ${CONFIG.delayBetweenRegistrations / 1000} detik...`);
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
