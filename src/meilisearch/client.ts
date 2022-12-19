import MeiliSearch from 'meilisearch'

import { loadConfig } from '../config'

let msClient: MeiliSearch | undefined

export const loadMeilisearch = async () => {
  if (!msClient) {
    const { meilisearch } = await loadConfig()
    if (!meilisearch) {
      throw new Error('MeiliSearch config not found')
    }

    msClient = new MeiliSearch({
      host: meilisearch.host,
      apiKey: meilisearch.apiKey,
    })
  }

  return msClient
}