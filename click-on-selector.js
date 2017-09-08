const puppeteer = require('puppeteer');
const process = require('process');

/**
 * Time to wait after network becomes idle for the page to become 'ready'
 */
const fudgeFactor = {
  small: 100,
  medium: 2000,
  large: 30000
};

const credentials = {
  username: process.env['GOOGLE_USERNAME'],
  password: process.env['GOOGLE_PASSWORD']
};

const sheetId = process.env['SHEET_ID'];
const clickOnSelector = process.env['CLICK_ON_SELECTOR']; // eg '[aria-label^="UPDATE-ALL"]'

console.log('Inputs provided: ');
console.log(`  username: ${credentials.username}`);
console.log(`  password: ${credentials.password ? '********' : credentials.password}`);
console.log(`  sheet_id: ${sheetId}`);
console.log(`  click_on_selector: ${clickOnSelector}`);
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
  await page.goto(url, { waitUntil: 'networkidle', networkIdleTimeout: fudgeFactor.medium }).catch(die(page));
  await dismissButterBar(page).catch(die(page));

  // use the menu to navigate to the cloud platform project menu
  await clickWhenPossible(page, '#macros-resources-menu').catch(die(page));
  console.log('clicked on the resources menu');
  await clickWhenPossible(page, '#\\:1t').catch(die(page));
  await page.waitForNavigation({ waitUntil: 'networkidle', networkIdleTimeout: fudgeFactor.small }).catch(die(page));
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

let die = (page) => {
  return async() => {
    console.log('Promise was rejected. Unable to continue');

    if (page) {
      await page.screenshot({path: 'screenshot.png'});
      console.log('Took a screenshot and saved to ./screenshot.png');
    }

    process.exit(1);
  }
}

let clickSelector = (async(page, selector) => {
  await page.evaluate((selector) => {
    let b = Array.prototype.filter.call(
      document.querySelectorAll(selector.toString()),
      e => e.style.display !== 'none');
    b[0].id = 'special-findable-id-selector';
  }, selector).catch(die(page));
  return page.click('#special-findable-id-selector');
});

(async() => {
  const browser = await puppeteer.launch({
    headless: false
  });
  const page = await browser.newPage().catch(die());
  await page.goto('https://apps.google.com/user/hub', { waitUntil: 'networkidle' }).catch(die(page));
  console.log('loaded sign in page');

  await type(page, credentials.username).catch(die(page));
  await page.press('Enter').catch(die(page));
  console.log('entered username');

  await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(die(page));
  await page.waitFor('#passwordNext').catch(die(page));
  await type(page, credentials.password).catch(die(page));
  await page.press('Enter').catch(die(page));
  console.log('entered password');

  await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(die(page));
  await page.waitFor('link[rel=canonical][href="https://apps.google.com/user/hub"]').catch(die(page));
  console.log('signed in');

  await page.goto(`https://docs.google.com/spreadsheets/d/${sheetId}`, {
    waitUntil: 'networkidle',
    networkIdleTimeout: fudgeFactor.medium
  }).catch(die(page));
  console.log('arrived at drive.google.com spreadsheet');

  await dismissButterBar(page).catch(die(page));
  await clickSelector(page, clickOnSelector).catch(die(page));
  console.log('clicked the selector');

  await page
    .waitFor('.modal-dialog button[name=continue]', { timeout: fudgeFactor.medium })
    .then(async() => {
      await page.click('.modal-dialog button[name=continue]');
      await page.waitForNavigation({ waitUntil: 'networkidle' })

      // If we haven't done this before, we need to authorize first
      let targets = await browser._connection.send('Target.getTargets').catch(die(page));
      let signInTargets = targets.targetInfos.filter(i => i.type === 'page' && i.url.match(/^https:\/\/accounts.google.com/));
      if (signInTargets.length === 0) {
        console.log('Error: No sign in targets found.');
        browser.close();
      }

      console.log('Prompted to sign in and approve access');
      await page.goto(signInTargets[0].url);
      await page.waitForNavigation({ waitUntil: 'networkidle' })
      console.log('Ready to sign in');
      await page.waitFor('[data-email]');
      await page.click('[data-email]');
      console.log('Signing in');
      await page.waitForNavigation({ waitUntil: 'networkidle' })
      await page.waitFor('#submit_approve_access');
      await page.click('#submit_approve_access');
      console.log('Approving access');
      await page.waitForNavigation({ waitUntil: 'networkidle' })
      await browser._connection.send('Target.closeTarget', { targetId: signInTargets[0].targetId });

      console.log('Going back to the spreadsheet');
      await page.goto(`https://docs.google.com/spreadsheets/d/${sheetId}`, {
        waitUntil: 'networkidle',
        networkIdleTimeout: fudgeFactor.medium
      }).catch(die(page));
      console.log('arrived back at drive.google.com spreadsheet');

      await clickSelector(page, clickOnSelector).catch(die(page));
    })
    .catch(() => {});

  console.log('waiting for network with a large fudge factor so that hopefully all the scripts will run');
  await page.waitForNavigation({ waitUntil: 'networkidle', networkIdleTimeout: fudgeFactor.large }).catch(die(page));

  browser.close();
})();
