import { expect, test } from './helpers/orca-app'

test.use({ seedTestRepo: false })

test('changes the Live View popout opacity through its header control', async ({
  electronApp,
  orcaPage
}) => {
  await orcaPage.evaluate(async () => {
    await window.__store?.getState().updateSettings({
      experimentalAgentDashboardPopout: true,
      experimentalAgentDashboardMode: 'popout',
      experimentalAgentDashboardDefaultView: 'live'
    })
  })

  const popoutPromise = electronApp.waitForEvent('window')
  await orcaPage.evaluate(() => window.api.dashboard.openPopout('live'))
  const popout = await popoutPromise
  await popout.waitForLoadState('domcontentloaded')

  if (process.platform === 'linux') {
    await expect(
      popout.getByRole('button', { name: 'Window opacity is unavailable on Linux' })
    ).toBeDisabled()
    return
  }

  const trigger = popout.getByRole('button', { name: 'Window opacity: 100%' })
  await expect(trigger).toBeEnabled()
  await trigger.click()
  const slider = popout.getByRole('slider', { name: 'Window opacity' })
  await expect(slider).toHaveAttribute('aria-valuenow', '100')
  await slider.press('ArrowLeft')

  await expect(popout.getByRole('button', { name: 'Window opacity: 95%' })).toBeVisible()
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => {
        const dashboard = BrowserWindow.getAllWindows().find(
          (window) => window.getTitle() === 'Orca Agent Dashboard'
        )
        return dashboard?.getOpacity() ?? null
      })
    )
    .toBe(0.95)
})
