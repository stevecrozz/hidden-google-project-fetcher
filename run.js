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

let printButterBarMessage = (async(page) => {
  let el = await page.$('#docs-butterbar-container .docs-butterbar-message');
  if (el) {
    let text = await page.evaluate(el => el.innerText);
    console.log(`Caught "butter bar" message: ${text}`);
  }
});

// wiat for a selector and then click it
let clickWhenPossible = (async(page, selector) => {
  await page.waitFor(selector);
  let el = await page.$(selector);
  await el.click();
});

// visits a script.google.com url and navigates to the cloud platform project
// window where we can find the project id, retrying if there are any errors
let navigateToCloudPlatformProjectWindow = (async(page, url) => {
  await page.goto(url, { waitUntil: 'networkidle', networkIdleTimeout: fudgeFactor.medium }).catch(die);
  await dismissButterBar(page).catch(die);

  // use the menu to navigate to the cloud platform project menu
  await clickWhenPossible(page, '#macros-resources-menu').catch(die);
  console.log('clicked on the resources menu');
  await clickWhenPossible(page, '#\\:1t').catch(die);
  await page.waitForNavigation({ waitUntil: 'networkidle', networkIdleTimeout: fudgeFactor.small }).catch(die);
  console.log('clicked on the cloud platform project menu');

  return page.waitFor('.script-devconsoleproject-dialog-projectlink');
});

// visits a script.google.com url and navigates to the cloud platform project
// window where we can find the project id, retrying if there are any errors
let keyboardNav = (async(page, keys) => {
  await page.keyboard.down('Alt');
  for (var key of keys) {
    await page.keyboard.down(key);
    await page.keyboard.up(key);
  }
  return page.keyboard.up('Alt');
});

let die = () => {
  console.log('Promise was rejected. Unable to continue');
  process.exit(1);
}

(async() => {
  const browser = await puppeteer.launch({
    // headless: false
  });
  const page = await browser.newPage().catch(die);
  await page.goto('https://apps.google.com/user/hub', { waitUntil: 'networkidle' }).catch(die);
  console.log('loaded sign in page');

  await type(page, credentials.username).catch(die);
  await page.press('Enter').catch(die);
  console.log('entered username');

  await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(die);
  await page.waitFor('#passwordNext').catch(die);
  await type(page, credentials.password).catch(die);
  await page.press('Enter').catch(die);
  console.log('entered password');

  await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(die);
  await page.waitFor('link[rel=canonical][href="https://apps.google.com/user/hub"]').catch(die);
  console.log('signed in');

  await page.goto(`https://docs.google.com/spreadsheets/d/${sheetId}`, {
    waitUntil: 'networkidle',
    networkIdleTimeout: fudgeFactor.medium
  }).catch(die);
  console.log('arrived at drive.google.com spreadsheet');

  await dismissButterBar(page).catch(die);

  await keyboardNav(page, 'te');
  console.log('navigated to the script editor');
  await page.waitForNavigation({ waitUntil: 'networkidle', networkIdleTimeout: fudgeFactor.medium }).catch(die);

  // clicking the script editor link opens a new tab, this code gets the URL of
  // the new tab so we can use it
  let targets = await browser._connection.send('Target.getTargets').catch(die);
  let googleAppsScriptTargets = targets.targetInfos.filter(i => i.type === 'page' && i.url.match(/^https:\/\/script.google.com/));
  if (googleAppsScriptTargets.length === 0) {
    console.log('No google apps script targets found');
    browser.close();
  }

  // try this a couple times. sometimes google has an error here and the retry resolves it
  await navigateToCloudPlatformProjectWindow(page, googleAppsScriptTargets[0].url).catch(() => {
    return printButterBarMessage(page).then(() => {
      console.log('Retrying');
      return navigateToCloudPlatformProjectWindow(page, googleAppsScriptTargets[0].url);
    });
  }).catch(() => {
    return printButterBarMessage(page).then(() => {
      console.log('Retrying');
      return navigateToCloudPlatformProjectWindow(page, googleAppsScriptTargets[0].url);
    });
  }).catch(die);
  console.log('Found project link');

  let projectHref = await page.evaluate(() => {
    let container = window.document.getElementsByClassName('script-devconsoleproject-dialog-projectlink')[0];
    let link = container.getElementsByTagName('a')[0];
    return link.getAttribute('href');
  }).catch(die);
  console.log("Found project href: " + projectHref);

  browser.close();
})();
