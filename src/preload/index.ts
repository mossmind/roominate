import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('storage', {
  get: (key: string) => ipcRenderer.invoke('storage:get', key),
  set: (key: string, value: unknown) => ipcRenderer.invoke('storage:set', key, value),
  delete: (key: string) => ipcRenderer.invoke('storage:delete', key),
})

contextBridge.exposeInMainWorld('asana', {
  fetchTasks: (sectionGid: string) => ipcRenderer.invoke('asana:fetchTasks', sectionGid),
  fetchSections: (projectGid: string) => ipcRenderer.invoke('asana:fetchSections', projectGid),
})

contextBridge.exposeInMainWorld('anthropic', {
  generate: (brief: string, taskName: string) => ipcRenderer.invoke('anthropic:generate', { brief, taskName }),
  prayer: (taskName: string, taskNotes: string) => ipcRenderer.invoke('anthropic:prayer', { taskName, taskNotes }),
})
