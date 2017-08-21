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

// Uses the keyboard to type a string of text
let type = (async(page, text) => {
  let promise;

  for (var i = 0, len = text.length; i < len; i++) {
    promise = await page.keyboard.sendCharacter(text[i]);
  }

  return promise;
});

// Google drive, when viewed in headless mode pops up an unsupported browser
// warning that partly covers the UI, so it needs to be closed.
let dismissButterBar = (async(page) => {
  let el = await page.$('#docs-unsupported-browser-bar');
  if (el) {
    await el.click();
    await page.waitForNavigation({ waitUntil: 'networkidle' })
    console.log('dismissed browser incompatibility "butter bar"');
  }
});

// wiat for a selector and then click it
let clickWhenPossible = (async(page, selector) => {
  await page.waitFor(selector);
  let el = await page.$(selector);
  await el.click();
});

(async() => {
  const browser = await puppeteer.launch({
    // headless: false
  });
  const page = await browser.newPage();
  await page.goto('https://apps.google.com/user/hub', { waitUntil: 'networkidle' });
  console.log('loaded sign in page');

  await type(page, credentials.username);
  await page.press('Enter');
  console.log('entered username');

  await page.waitForNavigation({ waitUntil: 'networkidle' })
  await page.waitFor('#passwordNext');
  await type(page, credentials.password);
  await page.press('Enter');
  console.log('entered password');

  await page.waitForNavigation({ waitUntil: 'networkidle' })
  await page.waitFor('link[rel=canonical][href="https://apps.google.com/user/hub"]');
  console.log('signed in');

  await page.goto(`https://docs.google.com/spreadsheets/d/${sheetId}`, {
    waitUntil: 'networkidle',
    networkIdleTimeout: fudgeFactor.medium
  });
  console.log('arrived at drive.google.com spreadsheet');

  await dismissButterBar(page);

  // use the menu to navigate to the script editor
  await clickWhenPossible(page, '#docs-tools-menu');
  console.log('clicked on the tools menu');
  await clickWhenPossible(page, '#\\:hc');
  await page.waitForNavigation({ waitUntil: 'networkidle', networkIdleTimeout: fudgeFactor.medium })
  console.log('clicked the script editor link');

  // clicking the script editor link opens a new tab, this code gets the URL of
  // the new tab so we can use it
  let targets = await browser._connection.send('Target.getTargets');
  let googleAppsScriptTargets = targets.targetInfos.filter(i => i.type === 'page' && i.url.match(/^https:\/\/script.google.com/));
  if (googleAppsScriptTargets.length === 0) {
    console.log('No google apps script targets found');
    browser.close();
  }

  await page.goto(googleAppsScriptTargets[0].url, { waitUntil: 'networkidle', networkIdleTimeout: fudgeFactor.medium });
  await dismissButterBar(page);

  // use the menu to navigate to the cloud platform project menu
  await clickWhenPossible(page, '#macros-resources-menu');
  console.log('clicked on the resources menu');
  await clickWhenPossible(page, '#\\:1t');
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

  browser.close();
})();