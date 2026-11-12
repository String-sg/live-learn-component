import { expect, test } from '@playwright/test'
import { hostClient } from './client.js'

test('a host and independent desktop and mobile students share and resume one canvas', async ({ browser }) => {
  const passphrase = process.env.HOST_PASSPHRASE
  expect(Boolean(passphrase), 'Set HOST_PASSPHRASE').toBe(true)
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const firstContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const secondContext = await browser.newContext()
  const host = await hostContext.newPage()
  const first = await firstContext.newPage()
  const second = await secondContext.newPage()
  for (const page of [host, first, second]) page.setDefaultTimeout(7000)
  let pin
  try {
    await host.goto('/')
    await host.getByRole('button', { name: 'Host', exact: true }).click()
    await host.getByLabel('Host passphrase').fill(passphrase)
    await host.getByRole('button', { name: 'Sign in', exact: true }).click()
    await host.getByRole('button', { name: 'Create room' }).click()
    await expect(host.locator('#room-pin')).toHaveText(/^\d{4} \d{4}$/)
    pin = (await host.locator('#room-pin').innerText()).replace(' ', '')

    await first.goto('/')
    await expect(first.locator('#sample')).toBeInViewport({ ratio: 1 })
    await first.getByLabel('Room PIN').fill(pin)
    await first.getByLabel('Nickname').fill('Ada')
    await first.getByRole('button', { name: 'Join room' }).tap()
    await second.goto('/?pin=' + pin)
    await expect(second.getByLabel('Room PIN')).toHaveValue(pin)
    await second.getByLabel('Nickname').fill('Lin')
    await second.getByRole('button', { name: 'Join room' }).click()
    await expect(first.locator('#room-message')).toContainText('Wait for your host to start.')
    await expect(first.getByRole('button', { name: 'Start activity' })).toHaveCount(0)
    await expect(host.locator('#room-message')).toContainText('2 students joined.')

    await host.reload()
    await expect(host.getByRole('button', { name: 'Start activity' })).toBeVisible()
    await host.getByRole('button', { name: 'Start activity' }).click()
    const mobileSwatch = first.getByRole('button', { name: 'Sky', exact: true })
    await expect(mobileSwatch).toBeVisible()
    const { width, height } = await mobileSwatch.boundingBox()
    expect(Math.min(width, height)).toBeGreaterThanOrEqual(44)
    await expect(second.getByRole('button', { name: 'Coral', exact: true })).toBeVisible()
    await mobileSwatch.tap()
    await second.getByRole('button', { name: 'Coral', exact: true }).click()
    await Promise.all([
      first.getByRole('button', { name: 'Row 1, column 1, empty' }).tap(),
      (async () => {
        await second.getByRole('button', { name: 'Row 1, column 1, empty' }).focus()
        await second.keyboard.press('ArrowRight')
        await second.keyboard.press('Enter')
      })(),
    ])
    for (const page of [host, first, second]) {
      await expect(page.getByRole('button', { name: 'Row 1, column 1, Sky' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Row 1, column 2, Coral' })).toBeVisible()
    }
    expect(await first.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

    await first.reload()
    await expect(first.locator('#identity')).toHaveText('Ada')
    await expect(first.locator('#room-message')).toContainText('2 students joined.')
    await firstContext.setOffline(true)
    await expect(first.locator('#stage-status')).toHaveText('Reconnecting…')
    await first.getByRole('button', { name: 'Row 2, column 1, empty' }).tap()
    await second.getByRole('button', { name: 'Row 1, column 3, empty' }).click()
    await firstContext.setOffline(false)
    await expect(first.getByRole('button', { name: 'Row 1, column 3, Coral' })).toBeVisible()
    await expect(second.getByRole('button', { name: 'Row 2, column 1, Lime' })).toBeVisible()

    await host.getByRole('button', { name: 'End room' }).click()
    await expect(first.locator('#stage-status')).toHaveText('Room ended')
    await expect(second.locator('#stage-status')).toHaveText('Room ended')
    await expect(first.locator('#palette')).toBeHidden()
    await expect(first.getByRole('button', { name: 'Row 1, column 1, Sky' })).toBeDisabled()
    await first.reload()
    await expect(first.locator('#stage-status')).toHaveText('Room ended')
    await expect(first.getByRole('button', { name: 'Row 1, column 3, Coral' })).toBeVisible()
  } finally {
    if (pin) await (await hostClient()).request('/rooms/' + pin + '/end', {})
    await Promise.allSettled([hostContext.close(), firstContext.close(), secondContext.close()])
  }
})
