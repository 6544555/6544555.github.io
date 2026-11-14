import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const required = [
  'EDGE_EXEC',
  'PW_CORE',
  'PREVIEW_URL',
  'SB_URL',
  'SB_KEY',
  'DSH_SECRET_TEST_ACCOUNT_1',
]
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`)
}

const { chromium } = await import(pathToFileURL(process.env.PW_CORE).href)
const [email, password] = process.env.DSH_SECRET_TEST_ACCOUNT_1.split('|')
if (!email || !password) throw new Error('Invalid test-account format')

const marker = Date.now()
const messageText = `阶段7共享留言-${marker}`
const memoryTitle = `阶段7共享时光-${marker}`
const evidenceDirectory = join(dirname(dirname(fileURLToPath(import.meta.url))), 'docs', 'evidence')
const evidenceA = join(evidenceDirectory, 'stage7-browser-a-375.png')
const evidenceB = join(evidenceDirectory, 'stage7-browser-b-375.png')
mkdirSync(evidenceDirectory, { recursive: true })
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3FwAAAAASUVORK5CYII=',
  'base64',
)

async function launch() {
  const profile = join(tmpdir(), `birthday-stage7-${randomUUID()}`)
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.EDGE_EXEC,
    headless: true,
    viewport: { width: 375, height: 812 },
    args: ['--no-first-run', '--disable-extensions'],
  })
  return { context, profile }
}

async function cleanupBrowser(item) {
  if (item?.context) await item.context.close()
  if (item?.profile) {
    try {
      rmSync(item.profile, { recursive: true, force: true })
    } catch {
      // Windows can hold profile handles briefly after browser shutdown.
    }
  }
}

async function login(page) {
  await page.goto(process.env.PREVIEW_URL, { waitUntil: 'domcontentloaded' })
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await page.getByRole('heading', { name: '一封纪念信' }).waitFor({ timeout: 20000 })
    await page.getByLabel('邮箱').fill(email)
    await page.getByLabel('密码').fill(password)
    await page.getByRole('button', { name: '进入纪念册' }).click()
    try {
      await page.locator('#photos-title').waitFor({ timeout: 12000 })
      return attempt
    } catch {
      const retry = page.getByRole('button', { name: '再试一次' })
      if (!(await retry.isVisible().catch(() => false))) continue
      await retry.click()
    }
  }
  throw new Error('AUTH_LOGIN_RETRIES_EXHAUSTED')
}

async function waitReady(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('.status-slot-active').length === 0,
        null,
        { timeout: 15000 },
      )
      return true
    } catch {
      const retry = page.getByRole('button', { name: '再试一次' }).first()
      if (!(await retry.isVisible().catch(() => false))) return false
      await retry.click()
      await page.waitForTimeout(1000)
    }
  }
  return false
}

function accessToken(page) {
  return page.evaluate(() => {
    const storageKey = Object.keys(localStorage).find((key) => /auth-token/.test(key))
    if (!storageKey) return null
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
      return value.currentSession?.access_token ?? value.access_token ?? null
    } catch {
      return null
    }
  })
}

async function measureLayout(page) {
  const measurements = {}
  for (const [name, width, height] of [
    ['mobile', 375, 812],
    ['tablet', 768, 1024],
    ['desktop', 1440, 900],
  ]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(100)
    measurements[name] = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      columns: getComputedStyle(document.querySelector('.photo-grid'))
        .gridTemplateColumns.split(' ')
        .filter(Boolean).length,
      undersizedControls: Array.from(
        document.querySelectorAll('.site-shell button, .site-shell a'),
      )
        .filter((element) => {
          const rectangle = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return (
            style.display !== 'none' &&
            rectangle.width > 0 &&
            rectangle.height > 0 &&
            (rectangle.width < 44 || rectangle.height < 44)
          )
        })
        .map((element) => (element.textContent || '').trim())
        .slice(0, 10),
    }))
  }
  await page.setViewportSize({ width: 375, height: 812 })
  return measurements
}

async function deleteByFilter(page, token, table, column, value) {
  return page.evaluate(
    async ({ url, key, token, table, column, value }) => {
      const endpoint = `${url.replace(/\/$/, '')}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          apikey: key,
          Authorization: `Bearer ${token}`,
          Prefer: 'return=minimal',
        },
      })
      return response.status
    },
    {
      url: process.env.SB_URL,
      key: process.env.SB_KEY,
      token,
      table,
      column,
      value,
    },
  )
}

async function main() {
  let a
  let b
  let token
  const result = {}
  try {
    a = await launch()
    const pageA = a.context.pages()[0] ?? (await a.context.newPage())
    result.authAttemptA = await login(pageA)

    result.anonymousReadStatuses = await pageA.evaluate(
      async ({ url, key }) => {
        const base = url.replace(/\/$/, '')
        const statuses = {}
        for (const table of ['photos', 'memories', 'messages']) {
          statuses[table] = null
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              const response = await fetch(`${base}/rest/v1/${table}?select=id&limit=1`, {
                headers: { apikey: key },
              })
              statuses[table] = response.status
              break
            } catch {
              // Retry transient connection resets.
            }
          }
        }
        return statuses
      },
      { url: process.env.SB_URL, key: process.env.SB_KEY },
    )

    result.readyA = await waitReady(pageA)
    const beforeCount = await pageA.locator('.photo-card').count()
    await pageA.locator('input[type=file]').setInputFiles({
      name: 'stage7.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await pageA.waitForFunction(
      (count) => document.querySelectorAll('.photo-card').length > count,
      beforeCount,
      { timeout: 30000 },
    )
    result.photoCountAfterUpload = await pageA.locator('.photo-card').count()
    const photoLabel = await pageA
      .locator('.photo-card')
      .first()
      .locator('.photo-open')
      .getAttribute('aria-label')

    const composer = pageA.locator('.message-composer textarea')
    await composer.fill(messageText)
    await pageA.locator('.message-composer button[type=submit]').click()
    await pageA.getByText(messageText, { exact: true }).waitFor({ timeout: 30000 })

    await pageA.getByRole('button', { name: '写下这一刻' }).click()
    const form = pageA.locator('.entry-form')
    await form.locator('input[type=date]').fill('2026-11-14')
    await form.locator('input[type=text]').fill(memoryTitle)
    await form.locator('textarea').fill('阶段7跨浏览器共享验证')
    await form.locator('button[type=submit]').click()
    await pageA.getByText(memoryTitle, { exact: true }).waitFor({ timeout: 30000 })
    await pageA.screenshot({ path: evidenceA, fullPage: true })
    token = await accessToken(pageA)

    b = await launch()
    const pageB = b.context.pages()[0] ?? (await b.context.newPage())
    result.authAttemptB = await login(pageB)
    result.readyB = await waitReady(pageB)
    await pageB.getByText(messageText, { exact: true }).waitFor({ timeout: 30000 })
    await pageB.getByText(memoryTitle, { exact: true }).waitFor({ timeout: 30000 })
    result.sharedBrowser = {
      photos: await pageB.locator('.photo-card').count(),
      message: true,
      memory: true,
    }
    await pageB.screenshot({ path: evidenceB, fullPage: true })
    result.responsive = await measureLayout(pageB)
    result.evidence = { browserA: evidenceA, browserB: evidenceB }

    const target = pageB.getByRole('button', { name: photoLabel, exact: true })
    await target.click()
    await pageB.getByRole('button', { name: '移走这张', exact: true }).click()
    await pageB.getByRole('button', { name: '移走', exact: true }).click()
    await pageB.waitForFunction(
      (label) =>
        !Array.from(document.querySelectorAll('.photo-open')).some(
          (element) => element.getAttribute('aria-label') === label,
        ),
      photoLabel,
      { timeout: 30000 },
    )
    await pageA.reload({ waitUntil: 'domcontentloaded' })
    await pageA.locator('#photos-title').waitFor()
    result.photoGoneInA =
      (await pageA.getByRole('button', { name: photoLabel, exact: true }).count()) === 0

    await pageA.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
      timeout: 15000,
    })
    await a.context.setOffline(true)
    await pageA.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
    await pageA.locator('#photos-title').waitFor({ timeout: 15000 })
    await pageA.getByText('现在只看已保存的内容').first().waitFor({ timeout: 15000 })
    result.offlineAfterLogin = {
      main: true,
      snapshotText: await pageA.getByText(messageText, { exact: true }).isVisible(),
      offlineCopy: true,
    }
    await a.context.setOffline(false)

    if (token) {
      result.cleanup = {
        messages: await deleteByFilter(pageA, token, 'messages', 'text', messageText),
        memories: await deleteByFilter(pageA, token, 'memories', 'title', memoryTitle),
      }
    }

    await pageB.getByRole('button', { name: '退出登录' }).click()
    await pageB.getByRole('heading', { name: '一封纪念信' }).waitFor({ timeout: 15000 })
    result.signedOut = await pageB.evaluate(() => ({
      mainSections: document.querySelectorAll('#photos, #timeline, #messages').length,
      snapshot: localStorage.getItem('bday:v1:snapshot'),
      authCache: localStorage.getItem('bday:v2:authenticated-user'),
      authTokens: Object.keys(localStorage).filter((key) => /auth-token/.test(key)),
    }))

    await pageB.getByLabel('邮箱').fill(email)
    await pageB.getByLabel('密码').fill('definitely-wrong-password')
    await pageB.getByRole('button', { name: '进入纪念册' }).click()
    await pageB.locator('#auth-message').getByText(/这次没有认出你|入口暂时没有回应/).waitFor({
      timeout: 30000,
    })
    result.wrongPassword = {
      privateVisible: await pageB.locator('#photos-title').isVisible().catch(() => false),
      message: await pageB.locator('#auth-message').innerText(),
    }
    return result
  } finally {
    await cleanupBrowser(a)
    await cleanupBrowser(b)
  }
}

main()
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
