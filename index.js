const dotenv = require('dotenv')
const playwright = require('playwright')
const fs = require('fs')

const { chromium,  devices } = playwright

const proxies = require('./proxies.json')
const proxyIndex = proxies.findIndex(p => p.pending === false)
console.log(proxies[proxyIndex]);


dotenv.config();
(async () => {

  /*
  Берём страницу
  const startpage = await getLastPageFromDb()
   */
  proxies.forEach(p => p.pending = false)
  proxies[proxyIndex].pending = true

  const rewrited = JSON.stringify(proxies)

  fs.writeFile('./proxies.json', rewrited, err => {
    if (err) {
      console.log('Error writing file', err)
    } else {
      console.log('Successfully wrote file')
    }})



    const browser = await chromium.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    proxy: {
      server: `http://${proxies[proxyIndex].ip}:${proxies[proxyIndex].port}`,
      username: proxies[proxyIndex].username,
      password: proxies[proxyIndex].password,
    }
  })
  const context = await browser.newContext()
  const page = (await context.pages())[0] || (await context.newPage())
  await page.bringToFront()

  //
  //   .goto(`${startPage !== 0 ? `https://www.investing.com/news/${process.env.CATEGORY_NAME}/${startPage}` : `https://www.investing.com/news/${process.env.CATEGORY_NAME}`}`)
  //

  await page
    .goto(`https://www.investing.com/news/${process.env.CATEGORY_NAME}`, {
      timeout: 10000,
    })


  await parseCategory(page, context)
})()

async function parseCategory(p, c) {
  await p.waitForSelector(
    'div.largeTitle article[class*="js-article-item"] > a'
  )

  const pageNumber = await p.evaluate(
    () => document.querySelector('[class="pagination selected"]').innerText
  )
  console.log('Page Number: ', pageNumber)

  /*

  Вот тут кладём страницу в базу
  await putLastPageIntoDb(pageNumber)

  */

  await parseSinglePage(p, c)
  const nextPageBtn = await p.evaluateHandle(
    () =>
      document.querySelector('div[class*="midDiv"] a[class*="selected"]')
        .nextSibling
  )
  if (nextPageBtn) {
    await nextPageBtn.click()
    await parseCategory(p, c)
  }
}

async function parseSinglePage(p, c) {
  const linksOfNewsFromPage = await p.$$(
    'div.largeTitle article[class*="js-article-item"] > div > a'
  )
  for (let [index, link] of linksOfNewsFromPage.entries()) {
    console.log(index)
    await checkSingUpPopup(p)

    await parseSingleItem(c, link)

    await p.bringToFront()
  }
}

async function parseSingleItem(c, l) {
  //Open item page
  c.once('targetcreated', (target) => c(target.page()))
  await l.click({ button: 'middle' }).then(() => console.log('clicked'))
  await c.waitForEvent('page')
  const itemPage = (await c.pages()).slice(-1)[0]
  console.log(`Parsing single item ${itemPage.url()}`)
  if (!(itemPage.url().includes(`investing.com/news/`))) {
    console.log('TRASH PAGE ---> return')
    await itemPage.close()
    return
  }
  await itemPage.bringToFront()
  await itemPage.waitForLoadState().catch(() => {
    console.log('reload 2')
  })

  const itemData = await itemPage.evaluate(() => {
    const obj = {}

    obj.header = document.querySelector('h1[class="articleHeader"]').innerText
    obj.time = document.querySelector('[class="contentSectionDetails"] > span').innerText.split('ago ').length === 2
                ?  document
                  .querySelector('[class="contentSectionDetails"] > span').innerText.split('ago ')[1]
                :  document
                  .querySelector('[class="contentSectionDetails"] > span')
                 .innerText.split('ago ')
    obj.content = [...document.querySelectorAll('div[class*="articlePage"] p')]
      .map((p) => p.innerText)
      .join(' ')
    obj.source = document.querySelector('div[class="contentSectionDetails"] img').src.toLowerCase().includes('reuters') ? 'Reuters' : 'Investing'

    return obj
  })

  console.log(itemData)
  await itemPage.close()
}

async function checkSingUpPopup(page) {
  const signUpPopup = await page
    .waitForSelector('div[class*="signupWrap"]', { timeout: 1500 })
    .catch(() => false)
  console.log(signUpPopup)
  if (signUpPopup) {
    console.log('Sign up popup detected')
    await page.evaluate(() => {
      document
        .querySelector('div[class*="signupWrap"] [class*="popupCloseIcon"]')
        .click()
    })
  }
  await page.bringToFront()
}

async function errorHandle(err) {
  console.error(err)
  process.exit(1)
}

process
  .on('unhandledRejection', errorHandle)
  .on('uncaughtException', errorHandle)

async function sleep(ms) {
  console.log(`Sleep ${ms}`)
  return new Promise((resolve) => setTimeout(resolve, ms))
}
