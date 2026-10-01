import { expect, test } from '@playwright/test'
import { site } from './site'

test.describe('the front door', () => {
  test('answers with a document and a main landmark', async ({ page }) => {
    const response = await page.goto(site.home)
    expect(response?.status()).toBe(200)
    await expect(page.locator('main')).toBeAttached()
  })

  test('404s a path that does not exist, rather than erroring', async ({ request }) => {
    const response = await request.get(site.missing, { maxRedirects: 0 })
    expect(response.status()).toBe(404)
  })
})

test.describe('the admin', () => {
  /*
  The whole admin is one client bundle and the import map it reads. A stale
  map, a missing environment variable or a plugin that throws at init all
  surface here as a 500 or a blank screen — and as nothing at all in a test
  that does not load the page.
  */
  test('serves a sign-in screen', async ({ page }) => {
    const response = await page.goto(site.admin)
    expect(response?.status()).toBeLessThan(500)
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible({ timeout: 30_000 })
  })
})

test.describe('the REST API, to a request with nobody signed in', () => {
  /*
  The same rules `src/access/anonymousAccess.test.ts` checks as values, here as
  responses: proof that nothing between the rule and the wire — a plugin, an
  endpoint, a framework upgrade — reopened a collection.
  */
  for (const slug of site.privateCollections) {
    test(`refuses to list ${slug}`, async ({ request }) => {
      const response = await request.get(`/api/${slug}`)
      expect(response.status()).toBe(403)
    })
  }

  for (const slug of site.publicCollections) {
    test(`lists ${slug}`, async ({ request }) => {
      const response = await request.get(`/api/${slug}`)
      expect(response.status()).toBe(200)
      const body = (await response.json()) as { docs?: unknown }
      expect(Array.isArray(body.docs)).toBe(true)
    })
  }
})
