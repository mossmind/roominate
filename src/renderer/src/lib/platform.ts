/**
 * Platform abstraction — same API surface whether running in Electron or Capacitor.
 * Electron:  delegates to window.storage / window.asana (IPC bridge)
 * Web:       uses IndexedDB for storage (handles large dataUrls from file uploads),
 *            fetch() for Asana/AI
 */

export const isElectron = typeof window !== 'undefined' && !!(window as any).storage

// ── Web storage: IndexedDB wrapper ─────────────────────────────────────────
// localStorage quota (~5MB) is too small for mind map nodes with embedded file dataUrls.

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('roominate_kv', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv', 'readonly').objectStore('kv').get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── Storage ────────────────────────────────────────────────────────────────

export const storage = {
  get: async (key: string): Promise<unknown> => {
    if (isElectron) return (window as any).storage.get(key)
    return idbGet(key)
  },

  set: async (key: string, value: unknown): Promise<boolean> => {
    if (isElectron) return (window as any).storage.set(key, value)
    await idbSet(key, value)
    return true
  },

  delete: async (key: string): Promise<boolean> => {
    if (isElectron) return (window as any).storage.delete(key)
    await idbDelete(key)
    return true
  },
}

// ── Asana ──────────────────────────────────────────────────────────────────

interface AsanaApiTask {
  gid: string
  name: string
  due_on: string | null
  notes: string
  permalink_url: string
  completed: boolean
}

// ── AI ─────────────────────────────────────────────────────────────────────

async function anthropicFetch(messages: unknown[], system: string): Promise<string> {
  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system,
      messages,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.content?.[0]?.text ?? ''
}

export const files = {
  open: async (): Promise<{ filePath: string; fileName: string; ext: string; dataUrl: string | null } | null> => {
    if (isElectron) return (window as any).files.open()
    return null
  },
  openPath: async (filePath: string): Promise<void> => {
    if (isElectron) return (window as any).files.openPath(filePath)
  },
}

export const ai = {
  generateMindMap: async (brief: string, taskName: string): Promise<{ nodes: unknown[]; edges: unknown[] }> => {
    if (isElectron) return (window as any).anthropic.generate(brief, taskName)
    const text = await anthropicFetch(
      [{ role: 'user', content: `Project: ${taskName}\n\nBrief: ${brief || '(no brief provided)'}\n\nCreate 9-13 mind map nodes with this exact structure:\n\n1. ONE central node (nodeType: "central") — the project name, placed at canvas center (~340, 230), width 200.\n2. 2-3 "vibe" nodes — the feeling/mood this project must have.\n3. 1-2 "person" nodes — who it's for or who matters.\n4. 3-4 "thought" nodes — questions, constraints, ideas.\n\nLinking rules (STRICT):\n- Exactly ONE vibe node links to the central node. All other vibe nodes link to that first vibe node.\n- Exactly ONE person node links to the central node. All other person nodes link to that first person node.\n- Exactly ONE thought node links to the central node. All other thought nodes link to that first thought node.\n- No node links directly to central except the first of each category.\n\nColors: central="#657946", vibe="#8A9E6A", person="#C4956A", thought="#5B7FA8"\nNode text = max 6 words. Canvas 680x460. Spread each category cluster away from center.\n\nReturn ONLY valid JSON, no markdown:\n{"nodes":[{"id":"c","type":"text","nodeType":"central","x":270,"y":190,"w":200,"text":"${taskName}","url":"","color":"#657946"},{"id":"v1","type":"text","nodeType":"vibe","x":80,"y":100,"w":160,"text":"warm and tactile","url":"","color":"#8A9E6A"}],"edges":[{"id":"e1","from":"v1","to":"c"}]}` }],
      'You are an ADHD coach and creative thinking assistant. Output only valid JSON, no markdown.'
    )
    const json = JSON.parse(text.replace(/```json|```/g, '').trim())
    return json
  },

  generatePrayer: async (taskName: string, taskNotes: string): Promise<{ prompt: string; scripture: string; ref: string } | null> => {
    if (isElectron) return (window as any).anthropic.prayer(taskName, taskNotes)
    try {
      const text = await anthropicFetch(
        [{ role: 'user', content: `Project: ${taskName}\nNotes: ${taskNotes}\n\nWrite a short prayer prompt, a relevant scripture quote, and its reference. Return JSON: {"prompt":"...","scripture":"...","ref":"..."}` }],
        'You are a thoughtful Christian creative assistant. Output only valid JSON.'
      )
      return JSON.parse(text.replace(/```json|```/g, '').trim())
    } catch {
      return null
    }
  },
}

export const asana = {
  fetchSections: async (projectGid: string): Promise<{ gid: string; name: string }[]> => {
    if (isElectron) return (window as any).asana.fetchSections(projectGid)
    const res = await fetch(`/api/asana/projects/${projectGid}/sections?opt_fields=gid,name&limit=100`)
    const json = await res.json() as any
    if (json.errors) throw new Error(json.errors[0]?.message || 'Asana API error')
    if (json.error) throw new Error(json.error)
    return json.data ?? []
  },

  fetchTasks: async (sectionGid: string): Promise<AsanaApiTask[]> => {
    if (isElectron) return (window as any).asana.fetchTasks(sectionGid)
    const all: AsanaApiTask[] = []
    let offset: string | undefined

    do {
      let path = `/api/asana/sections/${sectionGid}/tasks?opt_fields=gid,name,due_on,notes,permalink_url,completed&limit=100`
      if (offset) path += `&offset=${encodeURIComponent(offset)}`
      const res = await fetch(path)
      const json = await res.json() as any
      if (json.errors) throw new Error(json.errors[0]?.message || 'Asana API error')
      if (json.error) throw new Error(json.error)
      all.push(...(json.data ?? []))
      offset = json.next_page?.offset
    } while (offset)

    return all
  },
}
