import { app, shell, BrowserWindow, ipcMain, net, dialog } from 'electron'
import { join, basename, extname } from 'path'
import { readFileSync } from 'fs'
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

  // ── Asana: comments on a task ────────────────────────────────────────────
  ipcMain.handle('asana:fetchComments', async (_, taskGid: string) => {
    const pat = store.get('asana_pat') as string | undefined
    if (!pat) throw new Error('No Asana token set.')
    return new Promise((resolve, reject) => {
      const url = `https://app.asana.com/api/1.0/tasks/${taskGid}/stories?opt_fields=text,created_at,type,created_by.name&limit=100`
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
            else resolve(
              (json.data ?? [])
                .filter((s: any) => s.type === 'comment' && s.text)
                .map((s: any) => ({ gid: s.gid, text: s.text, created_at: s.created_at, author: s.created_by?.name ?? null }))
            )
          } catch { reject(new Error('Invalid response from Asana')) }
        })
      })
      req.on('error', reject)
      req.end()
    })
  })

  // ── Asana: mark a task complete / reopen it ──────────────────────────────
  ipcMain.handle('asana:setCompleted', async (_, taskGid: string, completed: boolean) => {
    const pat = store.get('asana_pat') as string | undefined
    if (!pat) throw new Error('No Asana token set.')
    return new Promise((resolve, reject) => {
      const url = `https://app.asana.com/api/1.0/tasks/${taskGid}`
      const req = net.request({ method: 'PUT', url })
      req.setHeader('Authorization', `Bearer ${pat}`)
      req.setHeader('Accept', 'application/json')
      req.setHeader('Content-Type', 'application/json')
      let data = ''
      req.on('response', (res) => {
        res.on('data', (chunk) => (data += chunk.toString()))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.errors) reject(new Error(json.errors[0]?.message || 'Asana API error'))
            else resolve(json.data ?? null)
          } catch { reject(new Error('Invalid response from Asana')) }
        })
      })
      req.on('error', reject)
      req.write(JSON.stringify({ data: { completed } }))
      req.end()
    })
  })

  // ── Asana: post a comment on a task ──────────────────────────────────────
  ipcMain.handle('asana:addComment', async (_, taskGid: string, text: string) => {
    const pat = store.get('asana_pat') as string | undefined
    if (!pat) throw new Error('No Asana token set.')
    return new Promise((resolve, reject) => {
      const url = `https://app.asana.com/api/1.0/tasks/${taskGid}/stories`
      const req = net.request({ method: 'POST', url })
      req.setHeader('Authorization', `Bearer ${pat}`)
      req.setHeader('Accept', 'application/json')
      req.setHeader('Content-Type', 'application/json')
      let data = ''
      req.on('response', (res) => {
        res.on('data', (chunk) => (data += chunk.toString()))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.errors) reject(new Error(json.errors[0]?.message || 'Asana API error'))
            else {
              const s = json.data
              resolve({ gid: s.gid, text: s.text, created_at: s.created_at, author: s.created_by?.name ?? null })
            }
          } catch { reject(new Error('Invalid response from Asana')) }
        })
      })
      req.on('error', reject)
      req.write(JSON.stringify({ data: { text } }))
      req.end()
    })
  })

  // ── Asana: task details (assignee, custom fields, subtasks) ──────────────
  ipcMain.handle('asana:fetchTaskDetails', async (_, taskGid: string) => {
    const pat = store.get('asana_pat') as string | undefined
    if (!pat) throw new Error('No Asana token set.')

    function get(url: string): Promise<any> {
      return new Promise((resolve, reject) => {
        const req = net.request({ method: 'GET', url })
        req.setHeader('Authorization', `Bearer ${pat}`)
        req.setHeader('Accept', 'application/json')
        let data = ''
        req.on('response', (res) => {
          res.on('data', (chunk) => (data += chunk.toString()))
          res.on('end', () => {
            try { resolve(JSON.parse(data)) } catch { reject(new Error('Invalid response from Asana')) }
          })
        })
        req.on('error', reject)
        req.end()
      })
    }

    const [taskJson, subJson] = await Promise.all([
      get(`https://app.asana.com/api/1.0/tasks/${taskGid}?opt_fields=assignee.name,custom_fields.name,custom_fields.display_value`),
      get(`https://app.asana.com/api/1.0/tasks/${taskGid}/subtasks?opt_fields=name,completed,due_on&limit=100`),
    ])
    if (taskJson.errors) throw new Error(taskJson.errors[0]?.message || 'Asana API error')
    const t = taskJson.data ?? {}
    const customFields = (t.custom_fields ?? [])
      .filter((f: any) => f.display_value)
      .map((f: any) => ({ gid: f.gid, name: f.name, displayValue: String(f.display_value) }))
    const subtasks = (subJson.data ?? [])
      .map((s: any) => ({ gid: s.gid, name: s.name, completed: !!s.completed, due_on: s.due_on ?? null }))
    return { assignee: t.assignee?.name ?? null, customFields, subtasks }
  })

  // ── Anthropic: generate mind map ─────────────────────────────────────────
  ipcMain.handle('anthropic:generate', async (_, { brief, taskName }: { brief: string; taskName: string }) => {
    const apiKey = store.get('anthropic_key') as string | undefined
    if (!apiKey) throw new Error('No Anthropic API key set. Add it in Settings.')

    const prompt = `You are an ADHD coach helping a creative professional externalize a project into a mind map.

Project: "${taskName}"
Brief: "${brief || '(no brief provided)'}"

Create 11-16 nodes with this exact structure:

1. ONE central node (nodeType: "central") — the project name, placed at the canvas center (~340, 230), width 200.
2. 2-3 "vibe" nodes — the feeling/mood this project must have.
3. 1-2 "person" nodes — who it's for or who matters.
4. 2-3 "visual" nodes — concrete visual/creative cues pulled from the brief: colors, imagery, textures, material or style references — anything that hints at what the graphics should actually look like. Leave this category out if the brief truly has no visual cues to draw on.
5. 3-4 "thought" nodes — questions, constraints, ideas.

Linking rules (STRICT):
- Exactly ONE vibe node links to the central node. All other vibe nodes link to that first vibe node.
- Exactly ONE person node links to the central node. All other person nodes link to that first person node.
- Exactly ONE visual node links to the central node. All other visual nodes link to that first visual node.
- Exactly ONE thought node links to the central node. All other thought nodes link to that first thought node.
- No node links directly to central except the first of each category.

Colors: central="#657946", vibe="#8A9E6A", person="#C4956A", visual="#8B7BA8", thought="#5B7FA8"
Node text = max 6 words. Canvas 680×460. Spread each category cluster away from center.

Return ONLY valid JSON, no markdown:
{"nodes":[{"id":"c","type":"text","nodeType":"central","x":270,"y":190,"w":200,"text":"${taskName}","url":"","color":"#657946"},{"id":"v1","type":"text","nodeType":"vibe","x":80,"y":100,"w":160,"text":"warm and tactile","url":"","color":"#8A9E6A"}],"edges":[{"id":"e1","from":"v1","to":"c"}]}`

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

  // ── File: open dialog ────────────────────────────────────────────────────
  ipcMain.handle('file:open', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (result.canceled || !result.filePaths.length) return null
    const filePath = result.filePaths[0]
    const fileName = basename(filePath)
    const ext = extname(filePath).toLowerCase().replace('.', '')
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']
    if (imageExts.includes(ext)) {
      const data = readFileSync(filePath)
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
      return { filePath, fileName, ext, dataUrl: `data:${mime};base64,${data.toString('base64')}` }
    }
    return { filePath, fileName, ext, dataUrl: null }
  })

  // ── File: open in default app ────────────────────────────────────────────
  ipcMain.handle('file:openPath', async (_, filePath: string) => {
    await shell.openPath(filePath)
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
