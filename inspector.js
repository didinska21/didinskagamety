const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

// Gunakan stealth plugin
puppeteer.use(StealthPlugin());

async function inspectRegistrationPage() {
  console.log('🔍 GAMETY.ORG ADVANCED CLOUDFLARE BYPASS');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      // Anti-detection flags
      '--disable-blink-features=AutomationControlled',
      '--excludeSwitches=enable-automation',
      '--disable-infobars',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
    ignoreHTTPSErrors: true,
    ignoreDefaultArgs: ['--enable-automation'],
  });
  
  const page = await browser.newPage();
  
  // Remove webdriver traces
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
    
    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
    
    // Chrome runtime
    window.chrome = {
      runtime: {},
    };
    
    // Permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });
  
  // Set realistic user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  
  // Set viewport
  await page.setViewport({ 
    width: 1920, 
    height: 1080,
    deviceScaleFactor: 1,
  });
  
  // Set extra headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
  });
  
  try {
    console.log('📄 Membuka halaman registrasi...');
    console.log('⏳ Menunggu Cloudflare bypass (20-30 detik)...\n');
    
    // Go to page
    await page.goto('https://gamety.org/?pages=reg', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    
    console.log('⏳ Waiting 15 seconds for Cloudflare...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Check for Cloudflare challenge
    let attempts = 0;
    const maxAttempts = 6;
    
    while (attempts < maxAttempts) {
      const title = await page.title();
      const url = page.url();
      
      console.log(`\n🔍 Attempt ${attempts + 1}/${maxAttempts}`);
      console.log(`   Title: ${title}`);
      console.log(`   URL: ${url}`);
      
      // Check if still on Cloudflare
      if (title.toLowerCase().includes('just a moment') || 
          title.toLowerCase().includes('cloudflare') ||
          url.includes('challenge-platform')) {
        console.log('   ⏳ Still in Cloudflare challenge, waiting...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      } else {
        console.log('   ✅ Cloudflare bypassed!');
        break;
      }
    }
    
    if (attempts >= maxAttempts) {
      console.log('\n⚠️  Warning: Masih di Cloudflare setelah beberapa attempt');
      console.log('   Melanjutkan proses...\n');
    }
    
    // Extra wait untuk memastikan
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Wait for body to be loaded
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Ambil full HTML
    console.log('\n📋 Menyimpan HTML page...');
    const html = await page.content();
    fs.writeFileSync('registration_page.html', html);
    console.log('✅ HTML disimpan ke: registration_page.html');
    console.log(`   Size: ${(html.length / 1024).toFixed(2)} KB`);
    
    // Screenshot
    console.log('\n📸 Mengambil screenshot...');
    await page.screenshot({ 
      path: 'registration_page.png',
      fullPage: true 
    });
    console.log('✅ Screenshot disimpan ke: registration_page.png');
    
    // Inspect form details
    console.log('\n🔍 Menganalisa form...\n');
    
    const formInfo = await page.evaluate(() => {
      const info = {
        forms: [],
        inputs: [],
        buttons: [],
        captcha: null,
        selectFields: [],
        textareas: [],
      };
      
      // Cari semua form
      const forms = document.querySelectorAll('form');
      forms.forEach((form, idx) => {
        info.forms.push({
          index: idx,
          id: form.id || 'no-id',
          name: form.name || 'no-name',
          action: form.action || 'no-action',
          method: form.method || 'no-method',
          class: form.className || 'no-class',
        });
      });
      
      // Cari semua input
      const inputs = document.querySelectorAll('input');
      inputs.forEach((input, idx) => {
        info.inputs.push({
          index: idx,
          type: input.type,
          name: input.name || 'no-name',
          id: input.id || 'no-id',
          placeholder: input.placeholder || 'no-placeholder',
          class: input.className || 'no-class',
          value: input.value || '',
          required: input.required,
        });
      });
      
      // Cari select fields
      const selects = document.querySelectorAll('select');
      selects.forEach((select, idx) => {
        const options = Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.text
        }));
        info.selectFields.push({
          index: idx,
          name: select.name || 'no-name',
          id: select.id || 'no-id',
          class: select.className || 'no-class',
          options: options
        });
      });
      
      // Cari textarea
      const textareas = document.querySelectorAll('textarea');
      textareas.forEach((textarea, idx) => {
        info.textareas.push({
          index: idx,
          name: textarea.name || 'no-name',
          id: textarea.id || 'no-id',
          placeholder: textarea.placeholder || 'no-placeholder',
          class: textarea.className || 'no-class',
        });
      });
      
      // Cari semua button
      const buttons = document.querySelectorAll('button, input[type="submit"]');
      buttons.forEach((btn, idx) => {
        info.buttons.push({
          index: idx,
          type: btn.type,
          text: btn.textContent?.trim() || btn.value || 'no-text',
          id: btn.id || 'no-id',
          name: btn.name || 'no-name',
          class: btn.className || 'no-class',
        });
      });
      
      // Cari CAPTCHA image
      const captchaImages = document.querySelectorAll('img');
      captchaImages.forEach((img, idx) => {
        const src = img.src || '';
        const alt = img.alt || '';
        if (src.toLowerCase().includes('captcha') || 
            alt.toLowerCase().includes('captcha') ||
            src.toLowerCase().includes('code') ||
            src.toLowerCase().includes('verify')) {
          info.captcha = {
            index: idx,
            src: src,
            alt: alt,
            id: img.id || 'no-id',
            class: img.className || 'no-class',
          };
        }
      });
      
      return info;
    });
    
    // Print results
    console.log('📝 FORMS DITEMUKAN:');
    console.log('='.repeat(60));
    if (formInfo.forms.length === 0) {
      console.log('⚠️  Tidak ada form ditemukan!');
    } else {
      formInfo.forms.forEach(form => {
        console.log(`Form #${form.index}:`);
        console.log(`  ID: ${form.id}`);
        console.log(`  Name: ${form.name}`);
        console.log(`  Action: ${form.action}`);
        console.log(`  Method: ${form.method}`);
        console.log(`  Class: ${form.class}`);
        console.log('');
      });
    }
    
    console.log('\n📝 INPUT FIELDS DITEMUKAN:');
    console.log('='.repeat(60));
    if (formInfo.inputs.length === 0) {
      console.log('⚠️  Tidak ada input ditemukan!');
    } else {
      formInfo.inputs.forEach(input => {
        console.log(`Input #${input.index}:`);
        console.log(`  Type: ${input.type}`);
        console.log(`  Name: ${input.name}`);
        console.log(`  ID: ${input.id}`);
        console.log(`  Placeholder: ${input.placeholder}`);
        console.log(`  Class: ${input.class}`);
        console.log(`  Required: ${input.required}`);
        console.log('');
      });
    }
    
    console.log('\n📝 SELECT FIELDS DITEMUKAN:');
    console.log('='.repeat(60));
    if (formInfo.selectFields.length === 0) {
      console.log('⚠️  Tidak ada select field ditemukan!');
    } else {
      formInfo.selectFields.forEach(select => {
        console.log(`Select #${select.index}:`);
        console.log(`  Name: ${select.name}`);
        console.log(`  ID: ${select.id}`);
        console.log(`  Options: ${select.options.length}`);
        console.log('');
      });
    }
    
    console.log('\n📝 BUTTONS DITEMUKAN:');
    console.log('='.repeat(60));
    if (formInfo.buttons.length === 0) {
      console.log('⚠️  Tidak ada button ditemukan!');
    } else {
      formInfo.buttons.forEach(btn => {
        console.log(`Button #${btn.index}:`);
        console.log(`  Text: ${btn.text}`);
        console.log(`  Type: ${btn.type}`);
        console.log(`  Name: ${btn.name}`);
        console.log(`  ID: ${btn.id}`);
        console.log('');
      });
    }
    
    console.log('\n📝 CAPTCHA DITEMUKAN:');
    console.log('='.repeat(60));
    if (!formInfo.captcha) {
      console.log('⚠️  Tidak ada CAPTCHA ditemukan!');
    } else {
      console.log('CAPTCHA Info:');
      console.log(`  Src: ${formInfo.captcha.src}`);
      console.log(`  Alt: ${formInfo.captcha.alt}`);
      console.log(`  ID: ${formInfo.captcha.id}`);
    }
    
    // Simpan ke JSON
    console.log('\n💾 Menyimpan data ke JSON...');
    fs.writeFileSync('form_info.json', JSON.stringify(formInfo, null, 2));
    console.log('✅ Data disimpan ke: form_info.json');
    
    // Test fill form jika ada input
    if (formInfo.inputs.length > 0) {
      console.log('\n🧪 Testing form fill...\n');
      
      const testData = {
        username: 'testuser123',
        email: 'test@gmail.com',
        password: 'TestPass123!',
        number: '1234567890'
      };
      
      try {
        // Login/Username field
        const loginInput = formInfo.inputs.find(i => 
          i.placeholder.toLowerCase().includes('login') ||
          i.placeholder.toLowerCase().includes('user') ||
          i.name.toLowerCase().includes('login') ||
          i.name.toLowerCase().includes('user')
        );
        if (loginInput) {
          await page.type(`input[name="${loginInput.name}"]`, testData.username, { delay: 100 });
          console.log(`✅ Login field filled: ${loginInput.name}`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Email field
        const emailInput = formInfo.inputs.find(i => 
          i.type === 'email' ||
          i.placeholder.toLowerCase().includes('email') ||
          i.name.toLowerCase().includes('email')
        );
        if (emailInput) {
          await page.type(`input[name="${emailInput.name}"]`, testData.email, { delay: 100 });
          console.log(`✅ Email field filled: ${emailInput.name}`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Password field
        const passwordInput = formInfo.inputs.find(i => 
          i.type === 'password'
        );
        if (passwordInput) {
          await page.type(`input[name="${passwordInput.name}"]`, testData.password, { delay: 100 });
          console.log(`✅ Password field filled: ${passwordInput.name}`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Number/Phone field
        const numberInput = formInfo.inputs.find(i => 
          i.placeholder.toLowerCase().includes('number') ||
          i.placeholder.toLowerCase().includes('phone') ||
          i.name.toLowerCase().includes('number') ||
          i.name.toLowerCase().includes('phone') ||
          i.name.toLowerCase().includes('whatsapp')
        );
        if (numberInput) {
          await page.type(`input[name="${numberInput.name}"]`, testData.number, { delay: 100 });
          console.log(`✅ Number field filled: ${numberInput.name}`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Screenshot after fill
        await page.screenshot({ 
          path: 'form_filled.png',
          fullPage: true 
        });
        console.log('\n📸 Screenshot form terisi: form_filled.png');
        
      } catch (error) {
        console.error('❌ Error filling form:', error.message);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Inspection complete!');
    console.log('='.repeat(60));
    console.log('\n📁 Files generated:');
    console.log('  - registration_page.html (Full HTML)');
    console.log('  - registration_page.png (Screenshot)');
    console.log('  - form_info.json (Form data)');
    if (formInfo.inputs.length > 0) {
      console.log('  - form_filled.png (Filled form screenshot)');
    }
    
    console.log('\n⏳ Menunggu 3 detik sebelum menutup...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await browser.close();
    console.log('✅ Browser ditutup.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    await browser.close();
  }
}

// Run
inspectRegistrationPage().catch(console.error);
