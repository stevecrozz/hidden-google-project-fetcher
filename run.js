const puppeteer = require('puppeteer');
const process = require('process');

/**
 * Time to wait after network becomes idle for the page to become 'ready'
 */
const fudgeFactor = {
  small: 100,
  medium: 2000
};

const credentials = {
  username: process.env['GOOGLE_USERNAME'],
  password: process.env['GOOGLE_PASSWORD']
};

const sheetId = process.env['SHEET_ID'];

console.log('Inputs provided: ');
console.log(`  username: ${credentials.username}`);
console.log(`  password: ${credentials.password ? '********' : credentials.password}`);
console.log(`  sheet_id: ${sheetId}`);
console.log('');

(async() => {
  const browser = await puppeteer.launch({
    // headless: false
  });
  const page = await browser.newPage();
  await page.goto('https://apps.google.com/user/hub', { waitUntil: 'networkidle' });
  console.log('loaded sign in page');

  let el;
  let targets;

  for (var i = 0, len = credentials.username.length; i < len; i++) {
    await page.keyboard.sendCharacter(credentials.username[i]);
  }
  await page.press('Enter');
  console.log('entered username');

  await page.waitForNavigation({ waitUntil: 'networkidle' })
  await page.waitFor('#passwordNext');
  for (var i = 0, len = credentials.password.length; i < len; i++) {
    await page.keyboard.sendCharacter(credentials.password[i]);
  }
  await page.press('Enter');
  console.log('entered password');

  await page.waitForNavigation({ waitUntil: 'networkidle' })
  await page.waitFor('link[rel=canonical][href="https://apps.google.com/user/hub"]');
  console.log('signed in');

  await page.goto('https://docs.google.com/spreadsheets/d/' + sheetId, {
    waitUntil: 'networkidle',
    networkIdleTimeout: fudgeFactor.medium
  });
  console.log('arrived at drive.google.com spreadsheet');

  el = await page.$('#docs-unsupported-browser-bar');
  if (el) {
    await el.click();
    await page.waitForNavigation({ waitUntil: 'networkidle' })
    console.log('dismissed browser incompatibility "butter bar"');
  }

  await page.waitFor('#docs-tools-menu');
  el = await page.$('#docs-tools-menu');
  await el.click();
  console.log('clicked on the tools menu');

  el = await page.$('#\\:hc');
  await el.click();
  await page.waitForNavigation({ waitUntil: 'networkidle', networkIdleTimeout: fudgeFactor.medium })
  console.log('clicked the script editor link');

  targets = await browser._connection.send('Target.getTargets');
  let googleAppsScriptTargets = targets.targetInfos.filter(i => i.type === 'page' && i.url.match(/^https:\/\/script.google.com/));
  if (googleAppsScriptTargets.length === 0) {
    console.log('No google apps script targets found');
    browser.close();
  }

  await page.goto(googleAppsScriptTargets[0].url, { waitUntil: 'networkidle', networkIdleTimeout: fudgeFactor.medium });

  el = await page.$('#docs-unsupported-browser-bar');
  if (el) {
    await el.click();
    await page.waitForNavigation({ waitUntil: 'networkidle' })
    console.log('dismissed browser incompatibility "butter bar"');
  }

  await page.waitFor('#macros-resources-menu');
  el = await page.$('#macros-resources-menu');
  await el.click();
  console.log('clicked on the resources menu');
  el = await page.$('#\\:1t');
  el.click();
  await page.waitForNavigation({ waitUntil: 'networkidle', networkIdleTimeout: fudgeFactor.small })
  console.log('clicked on the cloud platform project menu');

  await page.waitFor('.script-devconsoleproject-dialog-projectlink');
  console.log('Found project link');

  let projectHref = await page.evaluate(() => {
    let container = window.document.getElementsByClassName('script-devconsoleproject-dialog-projectlink')[0];
    let link = container.getElementsByTagName('a')[0];
    return link.getAttribute('href');
  });
  console.log("Found project href: " + projectHref);

  await page.screenshot({ path: 'page.png' });
  console.log('Took screenshot');
  browser.close();
})();
