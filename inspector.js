const puppeteer = require('puppeteer');
const fs = require('fs');

async function inspectRegistrationPage() {
  console.log('🔍 GAMETY.ORG FORM INSPECTOR');
  console.log('='.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    console.log('📄 Membuka halaman registrasi...');
    await page.goto('https://gamety.org/?pages=reg', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Ambil full HTML
    console.log('\n📋 Menyimpan HTML page...');
    const html = await page.content();
    fs.writeFileSync('registration_page.html', html);
    console.log('✅ HTML disimpan ke: registration_page.html');
    
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
            src.toLowerCase().includes('code')) {
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
        console.log(`  Class: ${btn.class}`);
        console.log('');
      });
    }
    
    console.log('\n📝 CAPTCHA DITEMUKAN:');
    console.log('='.repeat(60));
    if (!formInfo.captcha) {
      console.log('⚠️  Tidak ada CAPTCHA ditemukan!');
    } else {
      console.log('CAPTCHA Info:');
      console.log(`  Index: ${formInfo.captcha.index}`);
      console.log(`  Src: ${formInfo.captcha.src}`);
      console.log(`  Alt: ${formInfo.captcha.alt}`);
      console.log(`  ID: ${formInfo.captcha.id}`);
      console.log(`  Class: ${formInfo.captcha.class}`);
    }
    
    // Simpan ke JSON
    console.log('\n💾 Menyimpan data ke JSON...');
    fs.writeFileSync('form_info.json', JSON.stringify(formInfo, null, 2));
    console.log('✅ Data disimpan ke: form_info.json');
    
    // Cek network requests saat submit
    console.log('\n🌐 Monitoring Network Requests...');
    
    page.on('request', request => {
      if (request.method() === 'POST') {
        console.log(`\n📤 POST Request:`);
        console.log(`  URL: ${request.url()}`);
        console.log(`  Headers:`, request.headers());
        console.log(`  Post Data:`, request.postData());
      }
    });
    
    page.on('response', response => {
      if (response.request().method() === 'POST') {
        console.log(`\n📥 POST Response:`);
        console.log(`  URL: ${response.url()}`);
        console.log(`  Status: ${response.status()}`);
      }
    });
    
    // Test fill form
    console.log('\n🧪 Testing form fill...\n');
    
    const testData = {
      username: 'testuser123',
      email: 'test@gmail.com',
      password: 'TestPass123!',
      number: '1234567890'
    };
    
    // Coba isi form
    try {
      // Login field
      const loginInput = formInfo.inputs.find(i => 
        i.placeholder.toLowerCase().includes('login') ||
        i.name.toLowerCase().includes('login')
      );
      if (loginInput) {
        await page.type(`input[name="${loginInput.name}"]`, testData.username);
        console.log(`✅ Login field filled: ${loginInput.name}`);
      }
      
      // Email field
      const emailInput = formInfo.inputs.find(i => 
        i.type === 'email' ||
        i.placeholder.toLowerCase().includes('email') ||
        i.name.toLowerCase().includes('email')
      );
      if (emailInput) {
        await page.type(`input[name="${emailInput.name}"]`, testData.email);
        console.log(`✅ Email field filled: ${emailInput.name}`);
      }
      
      // Password field
      const passwordInput = formInfo.inputs.find(i => 
        i.type === 'password'
      );
      if (passwordInput) {
        await page.type(`input[name="${passwordInput.name}"]`, testData.password);
        console.log(`✅ Password field filled: ${passwordInput.name}`);
      }
      
      // Number field
      const numberInput = formInfo.inputs.find(i => 
        i.placeholder.toLowerCase().includes('number') ||
        i.name.toLowerCase().includes('number')
      );
      if (numberInput) {
        await page.type(`input[name="${numberInput.name}"]`, testData.number);
        console.log(`✅ Number field filled: ${numberInput.name}`);
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
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Inspection complete!');
    console.log('='.repeat(60));
    console.log('\n📁 Files generated:');
    console.log('  - registration_page.html (Full HTML)');
    console.log('  - registration_page.png (Screenshot)');
    console.log('  - form_info.json (Form data)');
    console.log('  - form_filled.png (Filled form screenshot)');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

// Run
inspectRegistrationPage().catch(console.error);
