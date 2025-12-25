#!/usr/bin/env node

/**
 * Gamety.org Auto Register Bot - PUPPETEER FIXED
 * @airdropwithmeh
 */

const puppeteer = require('puppeteer');
const inquirer = require('inquirer');
const fs = require('fs');
const axios = require('axios');
const Tesseract = require('tesseract.js');
const cfonts = require('cfonts');
const UserAgent = require('user-agents');

// Colors
const RESET = '\u001B[0m';
const RED = '\u001B[31m';
const GREEN = '\u001B[32m';
const YELLOW = '\u001B[33m';
const BLUE = '\u001B[34m';
const CYAN = '\u001B[36m';
const BOLD = '\u001B[1m';

const BASE_URL = 'https://gamety.org';
const REG_URL = BASE_URL + '/?pages=reg';
const REFERRAL_CODE = '218053';

// Utils
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (min = 500, max = 1500) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

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
    const content = fs.readFileSync(filename, 'utf8');
    return content.split('
').map(line => line.trim()).filter(line => line !== '');
  } catch (error) {
    return [];
  }
}

function parseProxy(proxyString) {
  // Parse format: http://username:password@host:port
  const match = proxyString.match(/^(https?|socks5)://(?:([^:]+):([^@]+)@)?([^:]+):(d+)$/);
  
  if (!match) {
    console.log(YELLOW + '⚠️  Format proxy tidak valid: ' + proxyString + RESET);
    return null;
  }
  
  return {
    protocol: match[1],
    username: match[2] || null,
    password: match[3] || null,
    host: match[4],
    port: match[5],
    server: `${match[1]}://${match[4]}:${match[5]}`
  };
}

function saveAccount(email, password, status = 'success') {
  const timestamp = new Date().toISOString();
  const data = `${email}|${password}|${status}|${timestamp}
`;
  fs.appendFileSync('accounts.txt', data);
  console.log(GREEN + '💾 Saved to accounts.txt' + RESET);
}

function displayBanner() {
  console.clear();
  cfonts.say('GAMETY', {
    font: 'block',
    align: 'center',
    colors: ['cyan', 'magenta']
  });
  console.log('
' + CYAN + '     ╔════════════════════════════════════════╗' + RESET);
  console.log(CYAN + '     ║  PUPPETEER + OCR + PROXY ROTATION v2   ║' + RESET);
  console.log(CYAN + '     ║      @airdropwithmeh - Gamety Bot      ║' + RESET);
  console.log(CYAN + '     ╚════════════════════════════════════════╝' + RESET + '
');
}

async function getTempEmail() {
  try {
    console.log(CYAN + '📧 Creating temp email...' + RESET);
    
    const domainsRes = await axios.get('https://api.mail.tm/domains');
    const domains = domainsRes.data['hydra:member'].filter(d => d.isActive && !d.isPrivate);
    
    if (domains.length === 0) throw new Error('No domains');
    
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const username = Math.random().toString(36).substring(2, 15);
    const email = username + '@' + domain.domain;
    const password = 'Password123!';
    
    await axios.post('https://api.mail.tm/accounts', {
      address: email,
      password: password
    });
    
    console.log(GREEN + '✅ Email: ' + email + RESET);
    return { address: email, password: password };
    
  } catch (error) {
    console.log(RED + '❌ Email error: ' + error.message + RESET);
    return null;
  }
}

async function solveCaptcha(imagePath) {
  try {
    console.log(CYAN + '🔍 Reading captcha with OCR...' + RESET);
    
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
      logger: () => {}
    });
    
    const captcha = text.replace(/[^0-9]/g, '');
    
    if (captcha.length >= 4) {
      console.log(GREEN + '✅ Captcha: ' + captcha + RESET);
      return captcha;
    }
    
    console.log(YELLOW + '⚠️  Captcha unclear' + RESET);
    return null;
    
  } catch (error) {
    console.log(RED + '❌ OCR error: ' + error.message + RESET);
    return null;
  }
}

async function createAccount(proxyString = null, accountNum = 1) {
  let browser = null;
  
  try {
    console.log('
' + CYAN + '═'.repeat(70) + RESET);
    console.log(BOLD + `🚀 Creating account #${accountNum}...` + RESET);
    console.log(CYAN + '═'.repeat(70) + RESET + '
');
    
    // Launch options
    const launchOptions = {
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--user-agent=' + new UserAgent().toString()
      ]
    };
    
    // Parse and add proxy
    let proxyAuth = null;
    if (proxyString) {
      const proxy = parseProxy(proxyString);
      
      if (proxy) {
        // Add proxy server
        launchOptions.args.push(`--proxy-server=${proxy.server}`);
        console.log(YELLOW + `🔒 Proxy: ${proxy.host}:${proxy.port}` + RESET);
        
        // Store auth for later
        if (proxy.username && proxy.password) {
          proxyAuth = {
            username: proxy.username,
            password: proxy.password
          };
        }
      }
    }
    
    // Launch browser
    console.log(CYAN + '🌐 Launching browser...' + RESET);
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Authenticate proxy if needed
    if (proxyAuth) {
      await page.authenticate(proxyAuth);
    }
    
    // Get email
    const emailData = await getTempEmail();
    if (!emailData) throw new Error('Failed to get email');
    
    const username = emailData.address.split('@')[0];
    const password = generateRandomPassword();
    console.log(GREEN + '🔑 Password: ' + password + RESET);
    
    // Navigate to registration
    console.log(CYAN + '📄 Opening registration...' + RESET);
    await page.goto(REG_URL, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    await randomDelay(2000, 3000);
    
    // Screenshot
    await page.screenshot({ path: 'page.png' });
    console.log(CYAN + '📸 Screenshot: page.png' + RESET);
    
    // Wait for form
    await page.waitForSelector('input[name="name"]', { timeout: 10000 });
    
    // Get captcha
    console.log(CYAN + '🎯 Getting captcha...' + RESET);
    
    let captchaText = null;
    
    // Try to find captcha image
    try {
      const captchaImg = await page.$('img[src*="image.php"]');
      
      if (captchaImg) {
        await captchaImg.screenshot({ path: 'captcha.png' });
        console.log(CYAN + '📸 Captcha saved' + RESET);
        captchaText = await solveCaptcha('captcha.png');
      }
    } catch (e) {
      console.log(YELLOW + '⚠️  Image captcha not found' + RESET);
    }
    
    // Fallback: check text captcha
    if (!captchaText) {
      captchaText = await page.evaluate(() => {
        const numberInput = document.querySelector('input[name="number"]');
        if (numberInput) {
          const parent = numberInput.parentElement;
          const allText = parent.textContent;
          const match = allText.match(/d{4,}/);
          return match ? match[0] : null;
        }
        return null;
      });
      
      if (captchaText) {
        console.log(GREEN + '✅ Text captcha: ' + captchaText + RESET);
      }
    }
    
    if (!captchaText) {
      throw new Error('Captcha not found');
    }
    
    // Fill form
    console.log(CYAN + '✍️  Filling form...' + RESET);
    
    await page.click('input[name="name"]');
    await randomDelay(300, 600);
    await page.type('input[name="name"]', username, { delay: 100 });
    
    await page.click('input[name="email"]');
    await randomDelay(300, 600);
    await page.type('input[name="email"]', emailData.address, { delay: 100 });
    
    await page.click('input[name="pass"]');
    await randomDelay(300, 600);
    await page.type('input[name="pass"]', password, { delay: 100 });
    
    // Check if pass2 exists
    const pass2 = await page.$('input[name="pass2"]');
    if (pass2) {
      await page.click('input[name="pass2"]');
      await randomDelay(300, 600);
      await page.type('input[name="pass2"]', password, { delay: 100 });
    }
    
    await page.click('input[name="number"]');
    await randomDelay(300, 600);
    await page.type('input[name="number"]', captchaText, { delay: 150 });
    await randomDelay(500, 1000);
    
    // Screenshot before submit
    await page.screenshot({ path: 'before_submit.png' });
    
    // Submit
    console.log(CYAN + '📤 Submitting...' + RESET);
    
    const submitBtn = await page.$('button[name="sub_reg"]') || await page.$('input[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.evaluate(() => document.querySelector('form').submit());
    }
    
    // Wait
    await randomDelay(3000, 5000);
    await page.screenshot({ path: 'after_submit.png' });
    
    // Check success
    const currentUrl = page.url();
    const content = await page.content();
    const contentLower = content.toLowerCase();
    
    const success = 
      contentLower.includes('success') ||
      contentLower.includes('registered') ||
      contentLower.includes('welcome') ||
      contentLower.includes('dashboard') ||
      currentUrl !== REG_URL;
    
    if (success) {
      console.log(GREEN + BOLD + '
✅ REGISTRATION SUCCESS!' + RESET);
      console.log(GREEN + '📧 Email: ' + emailData.address + RESET);
      console.log(GREEN + '🔑 Password: ' + password + RESET);
      
      saveAccount(emailData.address, password, 'success');
      await browser.close();
      return true;
    } else {
      console.log(RED + '❌ Registration failed' + RESET);
      await browser.close();
      return false;
    }
    
  } catch (error) {
    console.log(RED + '
❌ Error: ' + error.message + RESET);
    
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages[0]) await pages[0].screenshot({ path: 'error.png' });
      } catch (e) {}
      await browser.close();
    }
    
    return false;
  }
}

async function main() {
  displayBanner();
  
  try {
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useProxy',
        message: 'Use proxy rotating?',
        default: false
      },
      {
        type: 'input',
        name: 'accountCount',
        message: 'How many accounts?',
        default: '1',
        validate: input => {
          const num = parseInt(input);
          return num > 0 && num <= 100 ? true : 'Enter 1-100';
        }
      },
      {
        type: 'input',
        name: 'delay',
        message: 'Delay between accounts (seconds):',
        default: '10',
        validate: input => parseInt(input) >= 0 ? true : 'Enter positive number'
      }
    ]);
    
    let proxies = [];
    if (answers.useProxy) {
      proxies = readProxiesFromFile('proxy.txt');
      if (proxies.length === 0) {
        console.log(RED + '❌ proxy.txt empty!' + RESET);
        console.log(YELLOW + 'Format: http://user:pass@host:port' + RESET);
        return;
      }
      console.log(GREEN + `✅ Loaded ${proxies.length} proxies
` + RESET);
    }
    
    const accountCount = parseInt(answers.accountCount);
    const delayMs = parseInt(answers.delay) * 1000;
    
    let successCount = 0;
    let failedCount = 0;
    
    console.log(BLUE + '═'.repeat(70) + RESET);
    console.log(BOLD + '🚀 STARTING AUTOMATION' + RESET);
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
      
      if (i < accountCount - 1) {
        console.log(YELLOW + `
⏳ Delay ${answers.delay}s...
` + RESET);
        await delay(delayMs);
      }
    }
    
    console.log('
' + BLUE + '═'.repeat(70) + RESET);
    console.log(BOLD + '📊 SUMMARY' + RESET);
    console.log(BLUE + '═'.repeat(70) + RESET);
    console.log(GREEN + '✅ Success: ' + successCount + RESET);
    console.log(RED + '❌ Failed: ' + failedCount + RESET);
    console.log(CYAN + '📁 Saved: accounts.txt' + RESET);
    console.log(BLUE + '═'.repeat(70) + RESET);
    
  } catch (error) {
    console.log(RED + 'Error: ' + error.message + RESET);
  }
}

main().catch(console.error);
