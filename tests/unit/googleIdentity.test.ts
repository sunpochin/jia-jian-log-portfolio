/*
檔案用途：驗證 Google Identity Services script 載入、失敗後可重試，以及登入 nonce 的密碼學來源。
所在層：tests/unit；以假的 document 與 window.google 取代第三方 script，不對外連線。
主要關聯：src/lib/googleIdentity.ts、GoogleSignInButton 與 src/lib/auth.ts 的 ID token 流程。
*/
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

type Handler = () => void

class FakeScript {
  id = ''
  src = ''
  async = false
  defer = false
  removed = false
  private readonly handlers = new Map<string, Handler>()
  addEventListener(type: string, handler: Handler) { this.handlers.set(type, handler) }
  remove() { this.removed = true }
  emit(type: 'load' | 'error') { this.handlers.get(type)?.() }
}

let createdScript: FakeScript | null = null
let existingScript: FakeScript | null = null
const appended: FakeScript[] = []

const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

const fakeWindow: { google?: { accounts: { id: unknown } } } = {}

// 為什麼在 beforeAll 才覆寫：window／document 是整個測試程序共用的，載入期換掉會影響其他測試檔。
beforeAll(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: fakeWindow })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      getElementById: () => existingScript,
      createElement: () => { createdScript = new FakeScript(); return createdScript },
      head: { appendChild: (script: FakeScript) => { appended.push(script) } },
    },
  })
})

const { createGoogleNonce, getGoogleClientId, hashGoogleNonce, loadGoogleIdentityServices } = await import('../../src/lib/googleIdentity')

const identityApi = { initialize() {}, renderButton() {} }

beforeEach(() => {
  createdScript = null
  existingScript = null
  appended.length = 0
  delete fakeWindow.google
})

afterAll(() => {
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
  else Reflect.deleteProperty(globalThis, 'document')
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
  else Reflect.deleteProperty(globalThis, 'window')
})

describe('google client configuration', () => {
  test('reports an empty client id when the public env var is unset', () => {
    expect(getGoogleClientId()).toBe('')
  })
})

describe('loadGoogleIdentityServices', () => {
  test('removes the failed script so the next visit can retry', async () => {
    const pending = loadGoogleIdentityServices()
    expect(appended).toHaveLength(1)
    expect(createdScript?.src).toBe('https://accounts.google.com/gsi/client')
    expect(createdScript?.async).toBe(true)
    createdScript?.emit('error')
    await expect(pending).rejects.toThrow('Google Identity Services failed to load.')
    expect(createdScript?.removed).toBe(true)
  })

  test('rejects when the script loads without exposing its API', async () => {
    const pending = loadGoogleIdentityServices()
    createdScript?.emit('load')
    await expect(pending).rejects.toThrow('Google Identity Services loaded without its API.')
  })

  test('shares one in-flight load and resolves with the API once the script is ready', async () => {
    const first = loadGoogleIdentityServices()
    const second = loadGoogleIdentityServices()
    expect(second).toBe(first)
    expect(appended).toHaveLength(1)

    fakeWindow.google = { accounts: { id: identityApi } }
    createdScript?.emit('load')
    await expect(first).resolves.toBe(identityApi)
  })

  test('resolves immediately when Google Identity Services is already on the page', async () => {
    fakeWindow.google = { accounts: { id: identityApi } }
    await expect(loadGoogleIdentityServices()).resolves.toBe(identityApi)
    expect(appended).toHaveLength(0)
  })
})

describe('login nonce', () => {
  test('creates a 64-character hex nonce from the crypto random source', () => {
    const nonce = createGoogleNonce()
    expect(nonce).toMatch(/^[0-9a-f]{64}$/u)
    expect(createGoogleNonce()).not.toBe(nonce)
  })

  test('hashes the nonce with SHA-256 so Supabase can verify the Google token', async () => {
    // Google 端拿到的是 hash，Supabase 端拿到原文；兩者必須對得起來才通過 replay 檢查。
    await expect(hashGoogleNonce('abc')).resolves.toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
