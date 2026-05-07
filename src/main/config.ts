import Store from 'electron-store'
import type { AppConfig } from '@shared/types'

const store = new Store<AppConfig>({
  defaults: {
    libraryPath: '',
    fuzzyMatchThreshold: 0.6
  }
})

export function getConfig(): AppConfig {
  return {
    libraryPath: store.get('libraryPath'),
    fuzzyMatchThreshold: store.get('fuzzyMatchThreshold')
  }
}

export function setConfig(patch: Partial<AppConfig>): AppConfig {
  if (patch.libraryPath !== undefined) store.set('libraryPath', patch.libraryPath)
  if (patch.fuzzyMatchThreshold !== undefined) store.set('fuzzyMatchThreshold', patch.fuzzyMatchThreshold)
  return getConfig()
}
