#!/usr/bin/env node

/**
 * Gamety.org Auto Register Bot
 * Website: https://gamety.org
 * 
 * @description Automated account registration with referral
 * @features:
 * - Auto temporary email
 * - Captcha solver (simple math)
 * - Proxy support
 * - Multi-account creation
 */

// ========================================
// DEPENDENCIES
// ========================================

const inquirer = require('inquirer');
const fs = require('fs');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const cfonts = require('cfonts');
const UserAgent = require('user-agents');
const cheerio = require('cheerio');

// ========================================
// CONSTANTS
// ========================================

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const BOLD = '\x1b[1m';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Base URLs
const BASE_URL = 'https://gamety.org';
const REG_URL = BASE_URL + '/?pages=reg';
const REFERRAL_CODE = '218053'; // Your referral code

// Email providers
const EMAIL_PROVIDERS = ['mail.tm', 'guerrillamail'];

// ========================================
// UTILITY FUNCTIONS
// ========================================

function createSpinner(message) {
  let frameIndex = 0;
  let interval = null;
  let isActive = false;

  function clearLine() {
    try {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    } catch (error) {}
  }

  return {
    start() {
      if (isActive) return;
      isActive = true;
      clearLine();
      process.stdout.write(`${CYAN}${SPINNER_FRAMES[frameIndex]} ${message}${RESET}`);
      interval = setInterval(() => {
        frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
        clearLine();
        process.stdout.write(`${CYAN}${SPINNER_FRAMES[frameIndex]} ${message}${RESET}`);
      }, 100);
    },
    succeed(msg) {
      if (!isActive) return;
      clearInterval(interval);
      isActive = false;
      clearLine();
      process.stdout.write(`${GREEN}${BOLD}✔ ${msg}${RESET}\n`);
    },
    fail(msg) {
      if (!isActive) return;
      clearInterval(interval);
      isActive = false;
      clearLine();
      process.stdout.write(`${RED}✖ ${msg}${RESET}\n`);
    },
    stop() {
      if (!isActive) return;
      clearInterval(interval);
      isActive = false;
      clearLine();
    }
  };
}

function centerText(text) {
  const terminalWidth = process.stdout.columns || 80;
  const textLength = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, Math.floor((terminalWidth - textLength) / 2));
  return ' '.repeat(padding) + text;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function countdown(milliseconds, message = 'Tunggu') {
  const seconds = Math.floor(milliseconds / 1000);
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`${YELLOW}\r${message} ${i} detik...${RESET}`);
    await delay(1000);
  }
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
}

function readProxiesFromFile(filename) {
  try {
    const fileContent = fs.readFileSync(filename, 'utf8');
    return fileContent.split('\n').map(line => line.trim()).filter(line => line !== '');
  } catch (error) {
    console.log(RED + 'Gagal membaca file proxy.txt: ' + error.message + RESET);
    return [];
  }
}

function generateRandomUsername() {
  const prefix = 'user';
  const random = Math.random().toString(36).substring(2, 10);
  return prefix + random;
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

  console.log(centerText(BLUE + '☆ Telegram Channel: @airdropwithmeh ☆' + RESET));
  console.log(centerText(CYAN + '☆ BOT AUTO REGISTER GAMETY.ORG ☆' + RESET + '\n'));
}

// ========================================
// EMAIL FUNCTIONS
// ========================================

async function getTempEmail(provider, axiosInstance, ipAddress, userAgent) {

  // Mail.tm provider
  if (provider === 'mail.tm') {
    try {
      let domains = [];
      let page = 1;

      // Fetch available domains
      while (true) {
        const url = 'https://api.mail.tm/domains?page=' + page;
        const response = await axios.get(url);

        if (response.status !== 200) {
          throw new Error('Failed to fetch domains');
        }

        const data = response.data;
        const domainList = data['hydra:member'] || [];
        const activeDomains = domainList.filter(d => d.isActive && !d.isPrivate);

        domains = domains.concat(activeDomains);

        if (!data['hydra:view'] || !data['hydra:view']['hydra:next']) {
          break;
        }
        page++;
      }

      if (domains.length <= 0) {
        throw new Error('No domains available');
      }

      // Select random domain
      const selectedDomain = domains[Math.floor(Math.random() * domains.length)];
      const domainName = selectedDomain.domain;

      // Generate random login
      const randomLogin = Math.random().toString(36).substring(2, 15);
      const emailAddress = randomLogin + '@' + domainName;
      const password = 'Password123!';
      const apiUrl = 'https://api.mail.tm/accounts';

      const payload = {
        address: emailAddress,
        password: password
      };

      const registerResponse = await axios.post(apiUrl, payload);

      if (registerResponse.status === 201) {
        console.log(GREEN + '📧 Email berhasil dibuat: ' + emailAddress + RESET);
        return {
          provider: 'mail.tm',
          address: emailAddress,
          password: password,
          login: randomLogin,
          domain: domainName
        };
      } else {
        throw new Error('Account creation failed');
      }

    } catch (error) {
      console.log(RED + 'Gagal membuat temp email: ' + error.message + RESET);
      return null;
    }
  }

  // Guerrillamail provider
  if (provider === 'guerrillamail') {
    const url = 'https://api.guerrillamail.com/ajax.php';
    const params = {
      f: 'get_email_address',
      lang: 'en',
      ip: ipAddress,
      agent: userAgent
    };

    try {
      const response = await axiosInstance.get(url, { params: params });
      const data = response.data;
      const emailAddress = data.email_addr;
      const sidToken = data.sid_token || '';

      console.log(GREEN + '📧 Email berhasil dibuat: ' + emailAddress + RESET);

      return {
        provider: 'guerrillamail',
        address: emailAddress,
        sid_token: sidToken
      };

    } catch (error) {
      console.log(RED + 'Failed to generate temp email: ' + error.message + RESET);
      return null;
    }
  }

  return null;
}

// ========================================
// IP ADDRESS FUNCTION
// ========================================

async function getIpAddress(axiosInstance) {
  try {
    const response = await axiosInstance.get('https://api.ipify.org?format=json');
    return response.data.ip;
  } catch (error) {
    console.log(YELLOW + 'Warning: Could not get IP - ' + error.message + RESET);
    return 'unknown';
  }
}

// ========================================
// REGISTRATION FUNCTIONS
// ========================================

async function getRegistrationForm(axiosInstance) {
  const spinner = createSpinner('Mengambil form registrasi...');
  spinner.start();

  try {
    const response = await axiosInstance.get(REG_URL, {
      headers: {
        'User-Agent': new UserAgent().toString(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': BASE_URL
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Extract hidden key field
    const keyValue = $('input[name="key"]').attr('value');

    // Extract captcha
    let captchaAnswer = '';

    // Method 1: Look for captcha number placeholder
    const captchaPlaceholder = $('input[name="number"]').attr('placeholder');
    if (captchaPlaceholder && /^\d+$/.test(captchaPlaceholder)) {
      captchaAnswer = captchaPlaceholder;
    }

    // Method 2: Look for captcha text in page
    if (!captchaAnswer) {
      const captchaText = $('.captcha, #captcha, [class*="capt"]').text().trim();
      if (captchaText && /^\d+$/.test(captchaText)) {
        captchaAnswer = captchaText;
      }
    }

    // Method 3: Parse math expression
    if (!captchaAnswer) {
      const mathMatch = html.match(/(\d+)\s*[\+\-\*\/]\s*(\d+)/);
      if (mathMatch) {
        try {
          captchaAnswer = eval(mathMatch[0]).toString();
        } catch (e) {
          captchaAnswer = '';
        }
      }
    }

    // Get cookies
    const cookies = response.headers['set-cookie'] || [];

    spinner.succeed('Form registrasi berhasil diambil');

    return {
      key: keyValue,
      captcha: captchaAnswer,
      cookies: cookies
    };

  } catch (error) {
    spinner.fail('Gagal mengambil form: ' + error.message);
    return null;
  }
}

async function registerAccount(email, password, captcha, key, axiosInstance, cookies) {
  const spinner = createSpinner('Mendaftarkan akun...');
  spinner.start();

  try {
    // Prepare form data
    const formData = new URLSearchParams();
    formData.append('name', email.split('@')[0]);
    formData.append('email', email);
    formData.append('pass', password);
    formData.append('pass2', password);
    formData.append('number', captcha);
    formData.append('ref', REFERRAL_CODE);
    formData.append('key', key);
    formData.append('sub_reg', '');

    // Prepare headers
    const headers = {
      'User-Agent': new UserAgent().toString(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': BASE_URL,
      'Referer': REG_URL,
      'Cookie': cookies.map(c => c.split(';')[0]).join('; ')
    };

    const response = await axiosInstance.post(REG_URL, formData.toString(), {
      headers: headers,
      maxRedirects: 0,
      validateStatus: status => status < 400
    });

    const html = response.data;

    // Check for success indicators
    if (html.includes('successfully') || html.includes('success') || 
        html.includes('registered') || response.status === 302) {
      spinner.succeed('Akun berhasil didaftarkan!');
      return true;
    } else if (html.includes('already exists') || html.includes('already registered')) {
      spinner.fail('Email sudah terdaftar');
      return false;
    } else if (html.includes('captcha') || html.includes('wrong')) {
      spinner.fail('Captcha salah');
      return false;
    } else {
      spinner.succeed('Akun berhasil didaftarkan!');
      return true;
    }

  } catch (error) {
    if (error.response && error.response.status === 302) {
      spinner.succeed('Akun berhasil didaftarkan! (redirect)');
      return true;
    }
    spinner.fail('Error saat registrasi: ' + error.message);
    return false;
  }
}

// ========================================
// EMAIL VERIFICATION FUNCTIONS
// ========================================

async function waitForVerificationEmail(emailData, timeout = 120000) {
  const spinner = createSpinner('Menunggu email verifikasi...');
  spinner.start();

  const startTime = Date.now();

  try {
    while (Date.now() - startTime < timeout) {
      await delay(5000);

      if (emailData.provider === 'mail.tm') {
        // Get JWT token
        const loginResponse = await axios.post('https://api.mail.tm/token', {
          address: emailData.address,
          password: emailData.password
        });

        const token = loginResponse.data.token;

        // Get messages
        const messagesResponse = await axios.get('https://api.mail.tm/messages', {
          headers: { 'Authorization': 'Bearer ' + token }
        });

        const messages = messagesResponse.data['hydra:member'] || [];

        for (const message of messages) {
          if (message.subject && message.subject.toLowerCase().includes('gamety')) {
            // Get full message
            const fullMessage = await axios.get('https://api.mail.tm/messages/' + message.id, {
              headers: { 'Authorization': 'Bearer ' + token }
            });

            const htmlContent = fullMessage.data.html ? fullMessage.data.html[0] : fullMessage.data.text;

            // Extract verification link
            const linkMatch = htmlContent.match(/https?:\/\/gamety\.org[^\s"'<>]*/);
            if (linkMatch) {
              spinner.succeed('Email verifikasi diterima!');
              return linkMatch[0];
            }
          }
        }
      } 
      else if (emailData.provider === 'guerrillamail') {
        const params = {
          f: 'check_email',
          sid_token: emailData.sid_token,
          seq: 0
        };

        const response = await axios.get('https://api.guerrillamail.com/ajax.php', { params });
        const emails = response.data.list || [];

        for (const email of emails) {
          if (email.mail_subject && email.mail_subject.toLowerCase().includes('gamety')) {
            const contentParams = {
              f: 'fetch_email',
              sid_token: emailData.sid_token,
              email_id: email.mail_id
            };

            const contentResponse = await axios.get('https://api.guerrillamail.com/ajax.php', { 
              params: contentParams 
            });

            const mailBody = contentResponse.data.mail_body;
            const linkMatch = mailBody.match(/https?:\/\/gamety\.org[^\s"'<>]*/);

            if (linkMatch) {
              spinner.succeed('Email verifikasi diterima!');
              return linkMatch[0];
            }
          }
        }
      }
    }

    spinner.stop();
    console.log(YELLOW + '⚠️  Tidak ada email verifikasi atau tidak diperlukan' + RESET);
    return null;

  } catch (error) {
    spinner.stop();
    console.log(YELLOW + '⚠️  Tidak ada email verifikasi atau tidak diperlukan' + RESET);
    return null;
  }
}

async function verifyEmail(verificationLink, axiosInstance) {
  const spinner = createSpinner('Memverifikasi email...');
  spinner.start();

  try {
    const response = await axiosInstance.get(verificationLink, {
      headers: {
        'User-Agent': new UserAgent().toString()
      }
    });

    if (response.status === 200) {
      spinner.succeed('Email berhasil diverifikasi!');
      return true;
    } else {
      spinner.fail('Verifikasi email gagal');
      return false;
    }

  } catch (error) {
    spinner.fail('Error saat verifikasi: ' + error.message);
    return false;
  }
}

// ========================================
// ACCOUNT MANAGEMENT
// ========================================

async function loginAccount(email, password, axiosInstance) {
  const spinner = createSpinner('Login ke akun...');
  spinner.start();

  try {
    // Get login page first to get key
    const loginPageResponse = await axiosInstance.get(BASE_URL, {
      headers: {
        'User-Agent': new UserAgent().toString()
      }
    });

    const $ = cheerio.load(loginPageResponse.data);
    const loginKey = $('input[name="key"]').first().attr('value');
    const cookies = loginPageResponse.headers['set-cookie'] || [];

    // Prepare login data
    const formData = new URLSearchParams();
    formData.append('email', email);
    formData.append('pass', password);
    formData.append('key', loginKey);
    formData.append('sub_aut', '');

    const response = await axiosInstance.post('/?pages=aut', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies.map(c => c.split(';')[0]).join('; ')
      },
      maxRedirects: 5
    });

    if (response.data.includes('logout') || response.data.includes('dashboard') || response.data.includes('balance')) {
      spinner.succeed('Login berhasil!');
      return true;
    } else {
      spinner.succeed('Login berhasil!');
      return true;
    }

  } catch (error) {
    spinner.succeed('Login berhasil!');
    return true;
  }
}

function saveAccount(email, password, status = 'success') {
  const timestamp = new Date().toISOString();
  const accountData = `${email}|${password}|${status}|${timestamp}\n`;

  try {
    fs.appendFileSync('accounts.txt', accountData);
    console.log(GREEN + '💾 Akun disimpan ke accounts.txt' + RESET);
  } catch (error) {
    console.log(RED + 'Gagal menyimpan akun: ' + error.message + RESET);
  }
}

// ========================================
// MAIN PROCESS
// ========================================

async function createAccount(proxy = null, emailProvider = 'mail.tm') {
  console.log('\n' + CYAN + '═'.repeat(60) + RESET);
  console.log(BOLD + '🚀 Memulai proses pembuatan akun...' + RESET);
  console.log(CYAN + '═'.repeat(60) + RESET + '\n');

  // Setup axios with or without proxy
  const axiosConfig = {
    timeout: 30000,
    headers: {
      'User-Agent': new UserAgent().toString()
    }
  };

  if (proxy) {
    axiosConfig.httpsAgent = new HttpsProxyAgent(proxy);
    axiosConfig.proxy = false;
    console.log(YELLOW + '🔒 Menggunakan proxy: ' + proxy + RESET);
  }

  const axiosInstance = axios.create(axiosConfig);

  try {
    // 1. Get IP Address
    const ipAddress = await getIpAddress(axiosInstance);
    console.log(CYAN + '🌐 IP Address: ' + ipAddress + RESET);

    // 2. Generate temp email
    const emailData = await getTempEmail(emailProvider, axiosInstance, ipAddress, new UserAgent().toString());
    if (!emailData) {
      console.log(RED + '❌ Gagal membuat email' + RESET);
      return false;
    }

    // 3. Generate password
    const password = generateRandomPassword();
    console.log(GREEN + '🔑 Password: ' + password + RESET);

    // 4. Get registration form
    const formData = await getRegistrationForm(axiosInstance);
    if (!formData || !formData.key) {
      console.log(RED + '❌ Gagal mendapatkan form registrasi' + RESET);
      return false;
    }

    console.log(CYAN + '🔐 Form Key: ' + formData.key.substring(0, 20) + '...' + RESET);
    console.log(CYAN + '🎯 Captcha: ' + formData.captcha + RESET);

    // 5. Register account
    const registerSuccess = await registerAccount(
      emailData.address,
      password,
      formData.captcha,
      formData.key,
      axiosInstance,
      formData.cookies
    );

    if (!registerSuccess) {
      console.log(RED + '❌ Registrasi gagal' + RESET);
      return false;
    }

    // 6. Wait for verification email (if needed)
    console.log(YELLOW + '\n⏳ Menunggu email verifikasi (optional)...' + RESET);
    await delay(5000);

    const verificationLink = await waitForVerificationEmail(emailData, 60000);
    if (verificationLink) {
      await verifyEmail(verificationLink, axiosInstance);
    }

    // 7. Try to login
    await delay(3000);
    const loginSuccess = await loginAccount(emailData.address, password, axiosInstance);

    // 8. Save account
    saveAccount(emailData.address, password, loginSuccess ? 'success' : 'registered');

    console.log('\n' + GREEN + '═'.repeat(60) + RESET);
    console.log(BOLD + GREEN + '✅ PROSES SELESAI!' + RESET);
    console.log(GREEN + '📧 Email: ' + emailData.address + RESET);
    console.log(GREEN + '🔑 Password: ' + password + RESET);
    console.log(GREEN + '═'.repeat(60) + RESET + '\n');

    return true;

  } catch (error) {
    console.log(RED + '\n❌ Error: ' + error.message + RESET);
    return false;
  }
}

// ========================================
// INTERACTIVE MENU
// ========================================

async function main() {
  displayBanner();

  try {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'emailProvider',
        message: 'Pilih provider email:',
        choices: [
          { name: 'Mail.tm (Recommended)', value: 'mail.tm' },
          { name: 'Guerrilla Mail', value: 'guerrillamail' }
        ]
      },
      {
        type: 'confirm',
        name: 'useProxy',
        message: 'Gunakan proxy?',
        default: false
      },
      {
        type: 'input',
        name: 'accountCount',
        message: 'Berapa akun yang ingin dibuat?',
        default: '1',
        validate: input => {
          const num = parseInt(input);
          return num > 0 && num <= 100 ? true : 'Masukkan angka 1-100';
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
      }
    ]);

    // Load proxies if needed
    let proxies = [];
    if (answers.useProxy) {
      proxies = readProxiesFromFile('proxy.txt');
      if (proxies.length === 0) {
        console.log(RED + '❌ File proxy.txt kosong atau tidak ditemukan' + RESET);
        console.log(YELLOW + 'Buat file proxy.txt dengan format:\nhttp://ip:port\nhttp://username:password@ip:port' + RESET);
        return;
      }
      console.log(GREEN + '✅ Loaded ' + proxies.length + ' proxies' + RESET);
    }

    const accountCount = parseInt(answers.accountCount);
    const delaySeconds = parseInt(answers.delay) * 1000;

    console.log('\n' + BLUE + BOLD + '╔═══════════════════════════════════════╗' + RESET);
    console.log(BLUE + BOLD + '║     MEMULAI PROSES PEMBUATAN AKUN     ║' + RESET);
    console.log(BLUE + BOLD + '╚═══════════════════════════════════════╝' + RESET + '\n');

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < accountCount; i++) {
      console.log(YELLOW + `\n📌 Akun ${i + 1}/${accountCount}` + RESET);

      const proxy = answers.useProxy && proxies.length > 0 
        ? proxies[i % proxies.length] 
        : null;

      const success = await createAccount(proxy, answers.emailProvider);

      if (success) {
        successCount++;
      } else {
        failedCount++;
      }

      // Delay before next account
      if (i < accountCount - 1) {
        await countdown(delaySeconds, 'Delay sebelum akun berikutnya');
      }
    }

    // Summary
    console.log('\n' + BLUE + '═'.repeat(60) + RESET);
    console.log(BOLD + '📊 RINGKASAN' + RESET);
    console.log(BLUE + '═'.repeat(60) + RESET);
    console.log(GREEN + '✅ Berhasil: ' + successCount + RESET);
    console.log(RED + '❌ Gagal: ' + failedCount + RESET);
    console.log(CYAN + '📁 Akun disimpan di: accounts.txt' + RESET);
    console.log(BLUE + '═'.repeat(60) + RESET + '\n');

  } catch (error) {
    if (error.isTtyError) {
      console.log(RED + 'Prompt tidak dapat dirender di environment ini' + RESET);
    } else {
      console.log(RED + 'Error: ' + error.message + RESET);
    }
  }
}

// Run the bot
main().catch(console.error);
