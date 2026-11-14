import { callFunction } from './api'
import { supabase } from './supabase'

/** Phone push alerts. iPhone needs Pro11 added to the Home Screen first (iOS 16.4+). */
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const pushPermission = (): NotificationPermission | 'unsupported' => (pushSupported() ? Notification.permission : 'unsupported')
/** On iPhone, push only works from the installed app. */
export const needsInstallForPush = () => isIos() && !isStandalone()

const ASKED = 'pro11.pushAsked'
export const pushAsked = () => localStorage.getItem(ASKED) === '1'
export const markPushAsked = () => localStorage.setItem(ASKED, '1')

function keyBytes(b64url: string): Uint8Array {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4)
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Asks for permission (must be called from a tap), subscribes this device and saves it. */
export async function enablePush(userId: string): Promise<'on' | 'denied' | 'unsupported' | 'install'> {
  if (needsInstallForPush()) return 'install'
  if (!pushSupported()) return 'unsupported'
  const perm = await Notification.requestPermission()
  markPushAsked()
  if (perm !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const { publicKey } = await callFunction<{ publicKey: string }>('send-push', { mode: 'key' })
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as unknown as BufferSource }))
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase.from('push_subscriptions').upsert({ user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' })
  if (error) throw new Error('Couldn’t save this phone for alerts')
  return 'on'
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
}

export async function pushIsOn(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration()
  return Boolean(await reg?.pushManager.getSubscription())
}

/** Android / desktop: the browser's own install prompt, kept for the Install screen. */
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: BIP | null = null
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP })
export const canPromptInstall = () => deferred !== null
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  return outcome === 'accepted'
}
