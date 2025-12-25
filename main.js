const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Use stealth plugin untuk bypass Cloudflare
puppeteer.use(StealthPlugin());

// Konfigurasi
const CONFIG = {
  baseUrl: 'https://gamety.org/?ref=218053',
  regUrl: 'https://gamety.org/?pages=reg',
  proxyFile: 'proxy.txt',
  accountsToCreate: 10,
  delayBetweenRegistrations: 8000,
  cloudflareTimeout: 90000,
  headless: false, // Set true untuk production
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

// Wait for Cloudflare bypass dengan deteksi yang lebih baik
async function waitForCloudflareBypass(page, timeout = 90000) {
  console.log('🛡️  Menunggu Cloudflare bypass...');
  
  const startTime = Date.now();
  let lastCheck = '';
  
  while (Date.now() - startTime < timeout) {
    try {
      const checkResult = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        const title = document.title.toLowerCase();
        const url = window.location.href;
        
        // Cek indikator Cloudflare
        const hasCloudflare = 
          bodyText.includes('verifying you are human') || 
          bodyText.includes('checking your browser') ||
          bodyText.includes('just a moment') ||
          title.includes('just a moment') ||
          bodyText.includes('enable javascript and cookies');
        
        // Cek indikator halaman sudah load
        const hasContent = 
          document.querySelectorAll('input').length > 0 ||
          bodyText.length > 200;
        
        return {
          hasCloudflare,
          hasContent,
          url,
          titlePreview: title.substring(0, 50),
          bodyPreview: bodyText.substring(0, 100),
        };
      });
      
      const status = `CF: ${checkResult.hasCloudflare}, Content: ${checkResult.hasContent}`;
      
      if (status !== lastCheck) {
        console.log(`   📊 Status: ${status}`);
        console.log(`   🔗 URL: ${checkResult.url}`);
        lastCheck = status;
      }
      
      // Jika tidak ada Cloudflare dan ada konten, berarti bypass berhasil
      if (!checkResult.hasCloudflare && checkResult.hasContent) {
        console.log('✅ Cloudflare bypass berhasil!');
        return true;
      }
      
      // Tunggu sebentar sebelum cek lagi
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed % 10 === 0 && elapsed > 0) {
        console.log(`   ⏳ Masih menunggu... (${elapsed}s/${timeout/1000}s)`);
      }
      
    } catch (error) {
      // Ignore error, lanjut cek
    }
  }
  
  console.log('⚠️  Timeout menunggu Cloudflare bypass');
  return false;
}

// Extract captcha number dari HTML
async function getCaptchaNumber(page) {
  try {
    console.log('🔍 Mencari captcha number...');
    
    const captchaNumber = await page.evaluate(() => {
      const allText = document.body.innerText;
      
      // Method 1: Cari pattern "Number: 12345"
      const numberMatch = allText.match(/Number[:\s]*(\d{4,})/i);
      if (numberMatch) {
        return numberMatch[1];
      }
      
      // Method 2: Cari di dekat input Number
      const numberInput = document.querySelector('input[placeholder*="Number" i], input[name*="number" i]');
      if (numberInput) {
        const parent = numberInput.closest('div, p, span, label');
        if (parent) {
          const text = parent.innerText || parent.textContent || '';
          const match = text.match(/\d{4,}/);
          if (match) {
            return match[0];
          }
        }
      }
      
      // Method 3: Cari semua angka 4+ digit dan ambil yang paling panjang
      const allNumbers = allText.match(/\b\d{4,}\b/g);
      if (allNumbers && allNumbers.length > 0) {
        return allNumbers.reduce((a, b) => a.length >= b.length ? a : b);
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

    // Launch options
    const launchOptions = {
      headless: CONFIG.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080',
      ],
      defaultViewport: {
        width: 1920,
        height: 1080
      },
    };

    // Add proxy jika ada
    if (proxyUrl) {
      // Parse proxy URL untuk authentication
      const proxyMatch = proxyUrl.match(/^(https?:\/\/)?(([^:]+):([^@]+)@)?(.+)$/);
      if (proxyMatch) {
        const [, protocol, , username, password, server] = proxyMatch;
        
        if (username && password) {
          launchOptions.args.push(`--proxy-server=${protocol || 'http://'}${server}`);
          console.log(`🌐 Menggunakan proxy: ${server} (dengan auth)`);
        } else {
          launchOptions.args.push(`--proxy-server=${proxyUrl}`);
          console.log(`🌐 Menggunakan proxy: ${proxyUrl}`);
        }
      }
    } else {
      console.log('🌐 Berjalan tanpa proxy');
    }

    console.log('🌐 Menginisialisasi browser dengan Stealth Plugin...');
    browser = await puppeteer.launch(launchOptions);
    page = await browser.newPage();

    // Authenticate proxy jika ada credentials
    if (proxyUrl) {
      const proxyMatch = proxyUrl.match(/^https?:\/\/([^:]+):([^@]+)@/);
      if (proxyMatch) {
        const [, username, password] = proxyMatch;
        await page.authenticate({
          username,
          password
        });
        console.log('✅ Proxy authentication berhasil');
      }
    }

    console.log('✅ Browser berhasil diinisialisasi');

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // Buka halaman referral dulu
    console.log('📄 Membuka halaman referral...');
    await page.goto(CONFIG.baseUrl, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    }).catch(() => console.log('⚠️  Timeout pada referral page, melanjutkan...'));
    
    // Tunggu Cloudflare bypass
    const bypassSuccess = await waitForCloudflareBypass(page, CONFIG.cloudflareTimeout);
    
    if (!bypassSuccess) {
      console.log('⚠️  Cloudflare bypass timeout, mencoba lanjut...');
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Screenshot setelah bypass
    await page.screenshot({ path: 'step1_after_referral.png', fullPage: true });
    console.log('📸 Screenshot: step1_after_referral.png');

    // Navigate ke halaman registrasi
    console.log('📄 Membuka halaman registrasi...');
    await page.goto(CONFIG.regUrl, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    }).catch(() => console.log('⚠️  Timeout pada registration page, melanjutkan...'));
    
    // Tunggu Cloudflare bypass lagi
    await waitForCloudflareBypass(page, CONFIG.cloudflareTimeout);
    
    console.log('⏳ Menunggu form load...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Ambil info halaman
    const pageInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return {
        inputCount: inputs.length,
        inputs: inputs.map(i => ({
          type: i.type,
          name: i.name,
          placeholder: i.placeholder,
        })),
        title: document.title,
        url: window.location.href,
        bodyLength: document.body.innerText.length,
        bodyPreview: document.body.innerText.substring(0, 200),
      };
    });

    console.log('📊 Info halaman:');
    console.log(`   URL: ${pageInfo.url}`);
    console.log(`   Title: ${pageInfo.title}`);
    console.log(`   Input count: ${pageInfo.inputCount}`);
    console.log(`   Body length: ${pageInfo.bodyLength}`);
    
    if (pageInfo.inputCount > 0) {
      console.log('   Input fields:');
      pageInfo.inputs.forEach((inp, idx) => {
        console.log(`     ${idx + 1}. Type: ${inp.type}, Name: ${inp.name}, Placeholder: ${inp.placeholder}`);
      });
    }

    // Screenshot form
    await page.screenshot({ path: 'step2_registration_page.png', fullPage: true });
    console.log('📸 Screenshot: step2_registration_page.png');

    if (pageInfo.inputCount === 0) {
      throw new Error('Form tidak ditemukan. Kemungkinan masih blocked oleh Cloudflare.');
    }

    console.log('✅ Form registrasi ditemukan!');

    // Get captcha number
    const captchaNumber = await getCaptchaNumber(page);

    // Isi form dengan metode yang lebih reliable
    console.log('✏️  Mengisi form registrasi...');
    
    await page.waitForTimeout(1000);

    const fillResult = await page.evaluate((data, captcha) => {
      const results = {};
      
      try {
        // Username/Login
        const loginSelectors = [
          'input[placeholder*="Login" i]',
          'input[name*="login" i]',
          'input[name*="username" i]',
          'input[placeholder*="Username" i]',
        ];
        
        for (const selector of loginSelectors) {
          const input = document.querySelector(selector);
          if (input) {
            input.focus();
            input.value = data.username;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            results.username = true;
            break;
          }
        }

        // Email
        const emailSelectors = [
          'input[type="email"]',
          'input[placeholder*="Email" i]',
          'input[name*="email" i]',
        ];
        
        for (const selector of emailSelectors) {
          const input = document.querySelector(selector);
          if (input) {
            input.focus();
            input.value = data.email;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            results.email = true;
            break;
          }
        }

        // Password
        const passwordSelectors = [
          'input[type="password"]',
          'input[placeholder*="Password" i]',
          'input[name*="password" i]',
        ];
        
        for (const selector of passwordSelectors) {
          const input = document.querySelector(selector);
          if (input) {
            input.focus();
            input.value = data.password;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            results.password = true;
            break;
          }
        }

        // Captcha/Number
        if (captcha) {
          const numberSelectors = [
            'input[placeholder*="Number" i]',
            'input[name*="number" i]',
            'input[name*="captcha" i]',
          ];
          
          for (const selector of numberSelectors) {
            const input = document.querySelector(selector);
            if (input) {
              input.focus();
              input.value = captcha;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              results.captcha = true;
              break;
            }
          }
        }

        return results;
      } catch (e) {
        return { error: e.message };
      }
    }, accountData, captchaNumber);

    console.log('   Hasil pengisian form:', fillResult);
    
    if (fillResult.username) console.log(`   ✓ Username: ${accountData.username}`);
    if (fillResult.email) console.log(`   ✓ Email: ${accountData.email}`);
    if (fillResult.password) console.log(`   ✓ Password: ${accountData.password}`);
    if (fillResult.captcha) console.log(`   ✓ Captcha: ${captchaNumber}`);

    await page.waitForTimeout(2000);

    // Screenshot form terisi
    await page.screenshot({ path: 'step3_form_filled.png', fullPage: true });
    console.log('📸 Screenshot: step3_form_filled.png');

    // Submit form
    console.log('📤 Mengirim form...');
    
    const submitResult = await page.evaluate(() => {
      // Cari tombol submit
      const buttonSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:contains("Create")',
        'button:contains("Register")',
        'button:contains("Sign")',
      ];
      
      // Cari semua button dan cek text
      const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      const submitBtn = allButtons.find(btn => {
        const text = (btn.textContent || btn.value || '').toLowerCase();
        return text.includes('create') || 
               text.includes('register') || 
               text.includes('submit') ||
               text.includes('sign up');
      });
      
      if (submitBtn) {
        submitBtn.click();
        return { success: true, method: 'button click' };
      }
      
      // Coba submit form
      const form = document.querySelector('form');
      if (form) {
        form.submit();
        return { success: true, method: 'form submit' };
      }
      
      return { success: false, error: 'Submit button not found' };
    });

    console.log('   Submit result:', submitResult);

    if (!submitResult.success) {
      throw new Error('Tombol submit tidak ditemukan');
    }
    
    console.log('✅ Form berhasil di-submit!');
    
    // Tunggu response
    await page.waitForTimeout(5000);
    
    // Screenshot hasil
    await page.screenshot({ path: 'step4_after_submit.png', fullPage: true });
    console.log('📸 Screenshot: step4_after_submit.png');
    
    // Cek hasil
    const finalInfo = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      bodyPreview: document.body.innerText.substring(0, 300),
    }));
    
    console.log('📊 Hasil akhir:');
    console.log(`   URL: ${finalInfo.url}`);
    console.log(`   Title: ${finalInfo.title}`);
    
    // Indikator sukses
    const isSuccess = 
      !finalInfo.url.includes('pages=reg') &&
      !finalInfo.bodyPreview.toLowerCase().includes('error') &&
      !finalInfo.bodyPreview.toLowerCase().includes('failed') &&
      !finalInfo.bodyPreview.toLowerCase().includes('invalid');

    const result = {
      success: isSuccess,
      username: accountData.username,
      email: accountData.email,
      password: accountData.password,
      captcha: captchaNumber,
      proxy: proxyUrl || 'No proxy',
      timestamp: new Date().toISOString(),
      finalUrl: finalInfo.url,
    };

    if (result.success) {
      console.log('✅ Registrasi BERHASIL!');
      saveAccount(result);
    } else {
      console.log('❌ Registrasi GAGAL (atau perlu verifikasi manual)');
    }

    return result;

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (page) {
      try {
        await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
        console.log('📸 Error screenshot: error_screenshot.png');
      } catch (e) {}
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
      } catch (e) {}
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
  console.log('🎮 GAMETY.ORG AUTO REGISTER (Puppeteer Stealth)');
  console.log('='.repeat(60));
  
  proxyList = loadProxies();
  
  console.log(`📊 Target: ${CONFIG.accountsToCreate} akun`);
  console.log(`🌐 Proxy: ${proxyList.length > 0 ? proxyList.length + ' proxy' : 'Tanpa proxy'}`);
  console.log(`🤖 Headless: ${CONFIG.headless}`);
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

    if (i < CONFIG.accountsToCreate - 1) {
      console.log(`⏱️  Menunggu ${CONFIG.delayBetweenRegistrations / 1000} detik...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRegistrations));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Berhasil: ${results.success}`);
  console.log(`❌ Gagal: ${results.failed}`);
  console.log(`📈 Success Rate: ${((results.success / CONFIG.accountsToCreate) * 100).toFixed(2)}%`);
  console.log(`📁 File: registered_accounts.txt`);
  console.log('='.repeat(60));
}

main().catch(console.error);
