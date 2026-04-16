/**
 * Platform abstraction — same API surface whether running in Electron or Capacitor.
 * Electron:  delegates to window.storage / window.asana (IPC bridge)
 * Mobile:    uses @capacitor/preferences for storage, fetch() for Asana
 */

import { Preferences } from '@capacitor/preferences'

const isElectron = typeof window !== 'undefined' && !!(window as any).storage

// ── Storage ────────────────────────────────────────────────────────────────

export const storage = {
  get: async (key: string): Promise<unknown> => {
    if (isElectron) return (window as any).storage.get(key)
    const { value } = await Preferences.get({ key })
    return value ? JSON.parse(value) : null
  },

  set: async (key: string, value: unknown): Promise<boolean> => {
    if (isElectron) return (window as any).storage.set(key, value)
    await Preferences.set({ key, value: JSON.stringify(value) })
    return true
  },

  delete: async (key: string): Promise<boolean> => {
    if (isElectron) return (window as any).storage.delete(key)
    await Preferences.remove({ key })
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

async function asanaFetch(path: string, pat: string): Promise<unknown> {
  const res = await fetch(`https://app.asana.com/api/1.0${path}`, {
    headers: { Authorization: `Bearer ${pat}`, Accept: 'application/json' },
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0]?.message || 'Asana API error')
  return json
}

async function getPat(): Promise<string> {
  const pat = await storage.get('asana_pat') as string | null
  if (!pat) throw new Error('No Asana token set. Go to Settings and add your Asana Personal Access Token.')
  return pat
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

export const ai = {
  generateMindMap: async (brief: string, taskName: string): Promise<{ nodes: unknown[]; edges: unknown[] }> => {
    if (isElectron) return (window as any).anthropic.generate(brief, taskName)
    const text = await anthropicFetch(
      [{ role: 'user', content: `Project: ${taskName}\n\nBrief: ${brief}\n\nGenerate a mind map as JSON with "nodes" (array of {id, type:"text", x, y, w, text, color?}) and "edges" (array of {id, from, to}). Lay out all nodes within a 800x600 bounding box (x: 0-800, y: 0-600). Node w should be 140-180. Space nodes evenly. Return only valid JSON, no markdown.` }],
      'You are a creative thinking assistant. Output only valid JSON, no markdown.'
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
    const pat = await getPat()
    const json = await asanaFetch(`/projects/${projectGid}/sections?opt_fields=gid,name&limit=100`, pat) as any
    return json.data ?? []
  },

  fetchTasks: async (sectionGid: string): Promise<AsanaApiTask[]> => {
    if (isElectron) return (window as any).asana.fetchTasks(sectionGid)
    const pat = await getPat()
    const all: AsanaApiTask[] = []
    let offset: string | undefined

    do {
      let path = `/sections/${sectionGid}/tasks?opt_fields=gid,name,due_on,notes,permalink_url,completed&limit=100`
      if (offset) path += `&offset=${encodeURIComponent(offset)}`
      const json = await asanaFetch(path, pat) as any
      all.push(...(json.data ?? []))
      offset = json.next_page?.offset
    } while (offset)

    return all
  },
}
