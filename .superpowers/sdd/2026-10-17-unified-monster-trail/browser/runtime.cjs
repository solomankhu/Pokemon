const { chromium } = require('C:/Users/ADMIN/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../../..');
const launchOptions = { headless: true, executablePath: 'C:/Users/ADMIN/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' };
module.exports = { chromium, launchOptions, ROOT };
