#!/usr/bin/env node

/**
 * Gamety.org Auto Register Bot - PUPPETEER VERSION
 * Website: https://gamety.org
 * 
 * @description Full browser automation dengan Puppeteer
 * @features:
 * - Puppeteer + Chromium (real browser)
 * - Auto OCR captcha (Tesseract)
 * - Proxy rotating support
 * - Auto temporary email
 * - Human-like behavior
 * - Screenshot on error
 */

// ========================================
// DEPENDENCIES
// ========================================

const puppeteer = require('puppeteer');
const inquirer = require('inquirer');
const fs = require('fs');
const axios = require('axios');
const Tesseract = require('tesseract.js');
const cfonts = require('cfonts');
const UserAgent = require('user-agents');

// ========================================
// CONSTANTS
// ========================================

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

const BASE_URL = 'https://gamety.org';
const REG_URL = BASE_URL + '/?pages=reg';
const REFERRAL_CODE = '218053';

// ========================================
// UTILITY FUNCTIONS
// ========================================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = 500, max = 1500) {
  return delay(Math.floor(Math.random() * (max - min + 1)) + min);
}

function generateRandomPassword() {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

function readProxiesFromFile(filename) {
  try {
    const fileContent = fs.readFileSync(filename, 'utf8');
    return fileContent.split('\n').map(line => line.trim()).filter(line => line !== '');
  } catch (error) {
    console.log(RED + 'Gagal membaca proxy.txt' + RESET);
    return [];
  }
}

function saveAccount(email, password, status = 'success') {
  const timestamp = new Date().toISOString();
  const accountData = `${email}|${password}|${status}|${timestamp}\n`;
  fs.appendFileSync('accounts.txt', accountData);
  console.log(GREEN + '💾 Akun disimpan ke accounts.txt' + RESET);
}

// ========================================
// BANNER
// ========================================

function displayBanner() {
  console.clear();
  cfonts.say('GAMETY', {
    font: 'block',
    align: 'center',
    colors: ['cyan', 'magenta']
  });
  console.log('\n');
  console.log(CYAN + '          ╔════════════════════════════════════════╗' + RESET);
  console.log(CYAN + '          ║     PUPPETEER + OCR + PROXY ROTATION   ║' + RESET);
  console.log(CYAN + '          ║      @airdropwithmeh - Gamety Bot      ║' + RESET);
  console.log(CYAN + '          ╚════════════════════════════════════════╝' + RESET);
  console.log('\n');
}

// ========================================
// EMAIL FUNCTIONS
// ========================================

async function getTempEmail() {
  try {
    console.log(CYAN + '📧 Membuat temporary email...' + RESET);

    // Get domains
    const domainsResponse = await axios.get('https://api.mail.tm/domains');
    const domains = domainsResponse.data['hydra:member'].filter(d => d.isActive && !d.isPrivate);

    if (domains.length === 0) {
      throw new Error('No domains available');
    }

    const selectedDomain = domains[Math.floor(Math.random() * domains.length)];
    const randomLogin = Math.random().toString(36).substring(2, 15);
    const emailAddress = randomLogin + '@' + selectedDomain.domain;
    const password = 'Password123!';

    // Create account
    const registerResponse = await axios.post('https://api.mail.tm/accounts', {
      address: emailAddress,
      password: password
    });

    if (registerResponse.status === 201) {
      console.log(GREEN + '✅ Email: ' + emailAddress + RESET);
      return {
        address: emailAddress,
        password: password
      };
    }

    throw new Error('Failed to create email');

  } catch (error) {
    console.log(RED + '❌ Gagal membuat email: ' + error.message + RESET);
    return null;
  }
}

// ========================================
// OCR CAPTCHA SOLVER
// ========================================

async function solveCaptcha(imagePath) {
  try {
    console.log(CYAN + '🔍 Membaca captcha dengan OCR...' + RESET);

    const { data: { text } } = await Tesseract.recognize(
      imagePath,
      'eng',
      {
        logger: m => {} // Silent
      }
    );

    // Extract only digits
    const captchaText = text.replace(/[^0-9]/g, '');

    if (captchaText.length >= 4) {
      console.log(GREEN + '✅ Captcha terdeteksi: ' + captchaText + RESET);
      return captchaText;
    }

    console.log(YELLOW + '⚠️  Captcha tidak jelas, retry...' + RESET);
    return null;

  } catch (error) {
    console.log(RED + '❌ OCR Error: ' + error.message + RESET);
    return null;
  }
}

// ========================================
// PUPPETEER AUTOMATION
// ========================================

async function createAccount(proxy = null, accountNumber = 1) {
  let browser = null;

  try {
    console.log('\n' + CYAN + '═'.repeat(70) + RESET);
    console.log(BOLD + `🚀 Memulai pembuatan akun #${accountNumber}...` + RESET);
    console.log(CYAN + '═'.repeat(70) + RESET + '\n');

    // Browser launch options
    const launchOptions = {
      headless: true, // Set false untuk lihat browser
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--user-agent=' + new UserAgent().toString()
      ]
    };

    // Add proxy if provided
    if (proxy) {
      // Parse proxy format: http://user:pass@host:port
      launchOptions.args.push('--proxy-server=' + proxy);
      console.log(YELLOW + '🔒 Proxy: ' + proxy.split('@')[1] || proxy + RESET);
    }

    // Launch browser
    console.log(CYAN + '🌐 Launching browser...' + RESET);
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Handle proxy authentication
    if (proxy && proxy.includes('@')) {
      const proxyParts = proxy.match(/:\/\/(.*):(.*)@/);
      if (proxyParts) {
        await page.authenticate({
          username: proxyParts[1],
          password: proxyParts[2]
        });
      }
    }

    // 1. Get temporary email
    const emailData = await getTempEmail();
    if (!emailData) {
      throw new Error('Failed to get email');
    }

    const username = emailData.address.split('@')[0];
    const password = generateRandomPassword();

    console.log(GREEN + '🔑 Password: ' + password + RESET);

    // 2. Navigate to registration page
    console.log(CYAN + '📄 Opening registration page...' + RESET);
    await page.goto(REG_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await randomDelay(1000, 2000);

    // Take screenshot for debugging
    await page.screenshot({ path: 'registration_page.png' });
    console.log(CYAN + '📸 Screenshot saved: registration_page.png' + RESET);

    // 3. Wait for form elements
    await page.waitForSelector('input[name="name"]', { timeout: 10000 });

    // 4. Get captcha image
    console.log(CYAN + '🎯 Capturing captcha...' + RESET);

    // Find captcha image element
    const captchaImageExists = await page.$('img[src*="image.php"]');
    let captchaText = '';

    if (captchaImageExists) {
      // Screenshot captcha area
      const captchaElement = await page.$('img[src*="image.php"]');
      await captchaElement.screenshot({ path: 'captcha.png' });
      console.log(CYAN + '📸 Captcha image saved: captcha.png' + RESET);

      // Solve with OCR
      captchaText = await solveCaptcha('captcha.png');

      if (!captchaText) {
        throw new Error('Failed to solve captcha');
      }
    } else {
      // Fallback: check if captcha is in text form
      const captchaDisplayed = await page.evaluate(() => {
        const numberInput = document.querySelector('input[name="number"]');
        if (numberInput) {
          const parent = numberInput.parentElement;
          const text = parent.textContent;
          const match = text.match(/\d{4,}/);
          return match ? match[0] : null;
        }
        return null;
      });

      captchaText = captchaDisplayed;
      console.log(CYAN + '🎯 Captcha from page: ' + captchaText + RESET);
    }

    if (!captchaText) {
      throw new Error('Captcha not found');
    }

    // 5. Fill form with human-like typing
    console.log(CYAN + '✍️  Filling form...' + RESET);

    // Login field
    await page.click('input[name="name"]');
    await randomDelay(300, 600);
    await page.type('input[name="name"]', username, { delay: 100 });
    await randomDelay(300, 600);

    // Email field
    await page.click('input[name="email"]');
    await randomDelay(300, 600);
    await page.type('input[name="email"]', emailData.address, { delay: 100 });
    await randomDelay(300, 600);

    // Password field
    await page.click('input[name="pass"]');
    await randomDelay(300, 600);
    await page.type('input[name="pass"]', password, { delay: 100 });
    await randomDelay(300, 600);

    // Confirm password (if exists)
    const pass2Exists = await page.$('input[name="pass2"]');
    if (pass2Exists) {
      await page.click('input[name="pass2"]');
      await randomDelay(300, 600);
      await page.type('input[name="pass2"]', password, { delay: 100 });
      await randomDelay(300, 600);
    }

    // Captcha field
    await page.click('input[name="number"]');
    await randomDelay(300, 600);
    await page.type('input[name="number"]', captchaText, { delay: 150 });
    await randomDelay(500, 1000);

    // Screenshot before submit
    await page.screenshot({ path: 'before_submit.png' });

    // 6. Submit form
    console.log(CYAN + '📤 Submitting registration...' + RESET);

    const submitButton = await page.$('button[name="sub_reg"], input[type="submit"]');
    if (submitButton) {
      await submitButton.click();
    } else {
      await page.evaluate(() => {
        document.querySelector('form').submit();
      });
    }

    // Wait for response
    await randomDelay(3000, 5000);

    // Screenshot after submit
    await page.screenshot({ path: 'after_submit.png' });

    // 7. Check success
    const currentUrl = page.url();
    const pageContent = await page.content();

    const isSuccess = 
      pageContent.toLowerCase().includes('success') ||
      pageContent.toLowerCase().includes('registered') ||
      pageContent.toLowerCase().includes('welcome') ||
      pageContent.toLowerCase().includes('dashboard') ||
      currentUrl.includes('dashboard') ||
      currentUrl !== REG_URL;

    if (isSuccess) {
      console.log(GREEN + BOLD + '\n✅ REGISTRASI BERHASIL!' + RESET);
      console.log(GREEN + '📧 Email: ' + emailData.address + RESET);
      console.log(GREEN + '🔑 Password: ' + password + RESET);
      console.log(GREEN + '🔗 Login: ' + BASE_URL + RESET);

      saveAccount(emailData.address, password, 'success');

      await browser.close();
      return true;
    } else {
      console.log(RED + '❌ Registrasi gagal' + RESET);
      await browser.close();
      return false;
    }

  } catch (error) {
    console.log(RED + '\n❌ Error: ' + error.message + RESET);

    // Screenshot on error
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          await pages[0].screenshot({ path: 'error_screenshot.png' });
          console.log(YELLOW + '📸 Error screenshot: error_screenshot.png' + RESET);
        }
      } catch (e) {}

      await browser.close();
    }

    return false;
  }
}

// ========================================
// MAIN MENU
// ========================================

async function main() {
  displayBanner();

  try {
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useProxy',
        message: 'Gunakan proxy rotating?',
        default: false
      },
      {
        type: 'input',
        name: 'accountCount',
        message: 'Berapa akun yang ingin dibuat?',
        default: '1',
        validate: input => {
          const num = parseInt(input);
          return num > 0 && num <= 100 ? true : 'Masukkan 1-100';
        }
      },
      {
        type: 'input',
        name: 'delay',
        message: 'Delay antar akun (detik):',
        default: '10',
        validate: input => {
          const num = parseInt(input);
          return num >= 0 ? true : 'Masukkan angka positif';
        }
      },
      {
        type: 'confirm',
        name: 'headless',
        message: 'Jalankan headless (tanpa tampilan browser)?',
        default: true
      }
    ]);

    // Load proxies
    let proxies = [];
    if (answers.useProxy) {
      proxies = readProxiesFromFile('proxy.txt');
      if (proxies.length === 0) {
        console.log(RED + '❌ proxy.txt kosong!' + RESET);
        return;
      }
      console.log(GREEN + `✅ Loaded ${proxies.length} proxies` + RESET);
    }

    const accountCount = parseInt(answers.accountCount);
    const delayMs = parseInt(answers.delay) * 1000;

    let successCount = 0;
    let failedCount = 0;

    console.log('\n' + BLUE + '═'.repeat(70) + RESET);
    console.log(BOLD + '🚀 MEMULAI AUTOMATION' + RESET);
    console.log(BLUE + '═'.repeat(70) + RESET);

    for (let i = 0; i < accountCount; i++) {
      const proxy = answers.useProxy && proxies.length > 0 
        ? proxies[i % proxies.length]
        : null;

      const success = await createAccount(proxy, i + 1);

      if (success) {
        successCount++;
      } else {
        failedCount++;
      }

      // Delay before next
      if (i < accountCount - 1) {
        console.log(YELLOW + `\n⏳ Delay ${answers.delay} detik...` + RESET);
        await delay(delayMs);
      }
    }

    // Summary
    console.log('\n' + BLUE + '═'.repeat(70) + RESET);
    console.log(BOLD + '📊 RINGKASAN' + RESET);
    console.log(BLUE + '═'.repeat(70) + RESET);
    console.log(GREEN + '✅ Berhasil: ' + successCount + RESET);
    console.log(RED + '❌ Gagal: ' + failedCount + RESET);
    console.log(CYAN + '📁 Saved: accounts.txt' + RESET);
    console.log(BLUE + '═'.repeat(70) + RESET);

  } catch (error) {
    console.log(RED + 'Error: ' + error.message + RESET);
  }
}

main().catch(console.error);
