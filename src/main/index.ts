import { app, shell, BrowserWindow, ipcMain, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'

const store = new Store()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#394125',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.mossmind.app')
  app.on('browser-window-created', (_, win) => optimizer.watchWindowShortcuts(win))

  // ── Storage IPC ──────────────────────────────────────────────────────────
  ipcMain.handle('storage:get', (_, key: string) => store.get(key, null))
  ipcMain.handle('storage:set', (_, key: string, value: unknown) => { store.set(key, value); return true })
  ipcMain.handle('storage:delete', (_, key: string) => { store.delete(key); return true })

  // ── Asana: list sections for a project ──────────────────────────────────
  ipcMain.handle('asana:fetchSections', async (_, projectGid: string) => {
    const pat = store.get('asana_pat') as string | undefined
    if (!pat) throw new Error('No Asana token set.')
    return new Promise((resolve, reject) => {
      const url = `https://app.asana.com/api/1.0/projects/${projectGid}/sections?opt_fields=gid,name&limit=100`
      const req = net.request({ method: 'GET', url })
      req.setHeader('Authorization', `Bearer ${pat}`)
      req.setHeader('Accept', 'application/json')
      let data = ''
      req.on('response', (res) => {
        res.on('data', (chunk) => (data += chunk.toString()))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.errors) reject(new Error(json.errors[0]?.message || 'Asana API error'))
            else resolve(json.data ?? [])
          } catch { reject(new Error('Invalid response from Asana')) }
        })
      })
      req.on('error', reject)
      req.end()
    })
  })

  // ── Asana REST API (direct, paginated) ──────────────────────────────────
  ipcMain.handle('asana:fetchTasks', async (_, sectionGid: string) => {
    const pat = store.get('asana_pat') as string | undefined
    if (!pat) throw new Error('No Asana token set. Go to Settings and add your Asana Personal Access Token.')

    function fetchPage(offset?: string): Promise<{ data: unknown[]; next_page: { offset: string } | null }> {
      return new Promise((resolve, reject) => {
        let url = `https://app.asana.com/api/1.0/sections/${sectionGid}/tasks?opt_fields=gid,name,due_on,notes,permalink_url,completed&limit=100`
        if (offset) url += `&offset=${encodeURIComponent(offset)}`
        const req = net.request({ method: 'GET', url })
        req.setHeader('Authorization', `Bearer ${pat}`)
        req.setHeader('Accept', 'application/json')
        let data = ''
        req.on('response', (res) => {
          res.on('data', (chunk) => (data += chunk.toString()))
          res.on('end', () => {
            try {
              const json = JSON.parse(data)
              if (json.errors) reject(new Error(json.errors[0]?.message || 'Asana API error'))
              else resolve({ data: json.data ?? [], next_page: json.next_page ?? null })
            } catch { reject(new Error('Invalid response from Asana')) }
          })
        })
        req.on('error', reject)
        req.end()
      })
    }

    const all: unknown[] = []
    let offset: string | undefined
    do {
      const page = await fetchPage(offset)
      all.push(...page.data)
      offset = page.next_page?.offset
    } while (offset)

    return all
  })

  // ── Anthropic: generate mind map ─────────────────────────────────────────
  ipcMain.handle('anthropic:generate', async (_, { brief, taskName }: { brief: string; taskName: string }) => {
    const apiKey = store.get('anthropic_key') as string | undefined
    if (!apiKey) throw new Error('No Anthropic API key set. Add it in Settings.')

    const prompt = `You are an ADHD coach helping break down a creative project into a mind map.

Project: "${taskName}"
Brief: "${brief || '(no brief provided)'}"

Create 8-12 nodes that help someone with ADHD get started and stay focused.

Rules:
- Central node = what "done" looks like in plain language
- 3-4 cluster nodes = main areas of work
- Leaf nodes = concrete next actions OR open questions
- ONE node must say "Start Here →" — the single best first step
- Node text = max 5 words, energising and concrete
- Colors: central="#657946", clusters="#454449", actions="#242329", start/questions="#EF9982"

Canvas 680×460. Central node near (300,210). Clusters at distance ~170px. Leaves near their cluster.

Return ONLY valid JSON, no markdown:
{"nodes":[{"id":"1","type":"text","x":300,"y":210,"w":160,"text":"core outcome","url":"","color":"#657946"}],"edges":[{"id":"e1","from":"1","to":"2"}]}`

    return new Promise<unknown>((resolve, reject) => {
      const body = JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
      const req = net.request({ method: 'POST', url: 'https://api.anthropic.com/v1/messages' })
      req.setHeader('x-api-key', apiKey)
      req.setHeader('anthropic-version', '2023-06-01')
      req.setHeader('content-type', 'application/json')
      let data = ''
      req.on('response', (res) => {
        res.on('data', (chunk) => (data += chunk.toString()))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.error) { reject(new Error(json.error.message)); return }
            const text = json.content?.[0]?.text ?? ''
            const match = text.match(/\{[\s\S]*\}/)
            if (!match) { reject(new Error('No JSON in AI response')); return }
            resolve(JSON.parse(match[0]))
          } catch { reject(new Error('Failed to parse AI response')) }
        })
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  })

  // ── Anthropic: generate prayer prompt ────────────────────────────────────
  ipcMain.handle('anthropic:prayer', async (_, { taskName, taskNotes }: { taskName: string; taskNotes: string }) => {
    const apiKey = store.get('anthropic_key') as string | undefined
    if (!apiKey) return null // silently fall back to static scripture

    const prompt = `You are a spiritual director helping a Christian creative professional pause and pray before starting their work.

Project: "${taskName}"
Brief: "${taskNotes || '(no brief provided)'}"

Write a specific, personal prayer prompt (2-3 sentences) that connects this exact project to God's purposes — referencing the actual work described. Then choose a single scripture verse that speaks directly to this project.

Return ONLY valid JSON, no markdown:
{"prompt":"...","scripture":"...","ref":"Book Chapter:Verse"}`

    return new Promise<unknown>((resolve) => {
      const body = JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      })
      const req = net.request({ method: 'POST', url: 'https://api.anthropic.com/v1/messages' })
      req.setHeader('x-api-key', apiKey)
      req.setHeader('anthropic-version', '2023-06-01')
      req.setHeader('content-type', 'application/json')
      let data = ''
      req.on('response', (res) => {
        res.on('data', (chunk) => (data += chunk.toString()))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            const text = json.content?.[0]?.text ?? ''
            const match = text.match(/\{[\s\S]*\}/)
            if (!match) { resolve(null); return }
            resolve(JSON.parse(match[0]))
          } catch { resolve(null) }
        })
      })
      req.on('error', () => resolve(null))
      req.write(body)
      req.end()
    })
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
