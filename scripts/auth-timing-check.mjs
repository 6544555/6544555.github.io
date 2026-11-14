import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const required = [
  'EDGE_EXEC',
  'PW_CORE',
  'PREVIEW_URL',
  'DSH_SECRET_TEST_ACCOUNT_1',
]
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`)
}

const { chromium } = await import(pathToFileURL(process.env.PW_CORE).href)
const [email, password] = process.env.DSH_SECRET_TEST_ACCOUNT_1.split('|')
if (!email || !password) throw new Error('Invalid test-account format')

const profile = join(tmpdir(), `birthday-auth-timing-${randomUUID()}`)
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.EDGE_EXEC,
  headless: true,
  viewport: { width: 375, height: 812 },
  args: ['--no-first-run', '--disable-extensions'],
})

async function waitForGate(page) {
  await page.getByRole('heading', { name: '一封纪念信' }).waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: '进入纪念册' }).waitFor({ timeout: 20000 })
}

async function login(page) {
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码').fill(password)
  const startedAt = Date.now()
  await page.getByRole('button', { name: '进入纪念册' }).click()
  await page.locator('#photos-title').waitFor({ timeout: 12000 })
  return { elapsedMs: Date.now() - startedAt }
}

async function logout(page) {
  await page.getByRole('button', { name: '退出登录' }).click()
  await waitForGate(page)
}

try {
  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto(process.env.PREVIEW_URL, { waitUntil: 'domcontentloaded' })

  const loginRuns = []
  for (let index = 0; index < 3; index += 1) {
    await waitForGate(page)
    loginRuns.push(await login(page))
    await logout(page)
  }
  const loginTimesMs = loginRuns.map((run) => run.elapsedMs)

  await waitForGate(page)
  await login(page)
  const expiryUpdated = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.endsWith('-auth-token'))
    if (!key) return false
    const value = JSON.parse(localStorage.getItem(key) ?? '{}')
    const session = value.currentSession ?? value
    session.expires_at = Math.floor(Date.now() / 1000) - 120
    localStorage.setItem(key, JSON.stringify(value))
    return true
  })
  if (!expiryUpdated) throw new Error('Persisted Supabase session was not found')

  const privateRequests = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/storage/v1/')) &&
      url.hostname.endsWith('.supabase.co')
    ) {
      privateRequests.push(url.pathname)
    }
  })

  await page.route('**/auth/v1/token?grant_type=refresh_token', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 8000))
    await route.continue()
  })

  const publicShellStartedAt = Date.now()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.auth-public-shell').waitFor({ timeout: 3000 })
  const publicShellMs = Date.now() - publicShellStartedAt
  const privateRequestsBeforeAuth = privateRequests.length
  let authenticatedAfterRefreshMs = null
  try {
    await page.locator('#photos-title').waitFor({ timeout: 20000 })
    authenticatedAfterRefreshMs = Date.now() - publicShellStartedAt
  } catch {
    // A4 only requires the public shell to render while Auth is still delayed.
  }

  console.log(
    JSON.stringify(
      {
        loginRuns,
        loginTimesMs,
        loginUnder2Seconds: loginTimesMs.every((value) => value < 2000),
        delayedRefresh: {
          delayMs: 8000,
          publicShellMs,
          publicShellUnder1500Ms: publicShellMs < 1500,
          privateRequestsBeforeAuth,
          authenticatedAfterRefreshMs,
        },
      },
      null,
      2,
    ),
  )
} finally {
  await context.close()
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    // A later run can clean a profile still held briefly by Edge on Windows.
  }
}
