import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Shell } from '../components/Shell'
import { canPromptInstall, isIos, isStandalone, promptInstall } from '../lib/push'
import { useToast } from '../lib/toast'

export function Install() {
  const toast = useToast()
  const [os, setOs] = useState<'iphone' | 'android'>(isIos() ? 'iphone' : 'android')
  const steps = os === 'iphone'
    ? [['Tap the Share button', 'It’s at the bottom of Safari (the square with an arrow).'], ['Choose “Add to Home Screen”', 'Scroll down the list if you don’t see it.'], ['Tap Add', 'Pro11 now opens like any other app, and alerts can work.']]
    : [['Tap the ⋮ menu in Chrome', 'Top right of the screen.'], ['Choose “Install app” or “Add to Home screen”', 'The wording depends on your phone.'], ['Tap Install', 'Pro11 now opens like any other app.']]
  return (
    <Shell title="Install Pro11" back="/me">
      <div style={{ maxWidth: 560 }}>
        {isStandalone() ? (
          <div className="panel"><p className="rt">Pro11 is installed</p><p className="rs">You’re using the app version. Nothing to do.</p></div>
        ) : (
          <>
            <div className="seg" role="group" aria-label="Phone type">
              <button aria-pressed={os === 'iphone'} onClick={() => setOs('iphone')}>iPhone</button>
              <button aria-pressed={os === 'android'} onClick={() => setOs('android')}>Android</button>
            </div>
            {os === 'android' && canPromptInstall() && (
              <button className="btn primary block" style={{ marginTop: 14 }} onClick={async () => { if (await promptInstall()) toast('Installed') }}><Icon name="down" /><span>Install now</span></button>
            )}
            <section className="panel" style={{ marginTop: 12 }}>
              <div className="steps">
                {steps.map(([t, s], i) => (
                  <div key={t} className="step"><span className="step-n">{i + 1}</span><p className="step-t">{t}</p><p className="help" style={{ gridColumn: 2 }}>{s}</p></div>
                ))}
              </div>
            </section>
            {os === 'iphone' && <p className="help" style={{ marginTop: 12 }}>On iPhone, phone alerts only work in the installed app (iOS 16.4 or newer).</p>}
          </>
        )}
      </div>
    </Shell>
  )
}
