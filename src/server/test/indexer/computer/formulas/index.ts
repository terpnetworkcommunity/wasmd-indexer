import request from 'supertest'

import { loadConfig } from '@/core'
import { Contract } from '@/db'

import { app } from '../../app'
import { ComputerTestOptions } from '../types'
import { loadStakingTests } from './staking'
import { loadWasmTests } from './wasm'

export const loadFormulasTests = (options: ComputerTestOptions) => {
  describe('formula', () => {
    beforeEach(async () => {
      await Contract.create({ address: 'valid_contract', codeId: 1 })
    })

    loadStakingTests(options)
    loadWasmTests(options)

    it('filters contract by code IDs specified in formula', async () => {
      loadConfig().codeIds = {
        'dao-core': [1, 2],
      }
      options.mockFormula({
        filter: {
          codeIdsKeys: ['not-dao-core'],
        },
      })
      await request(app.callback())
        .get('/contract/valid_contract/some_formula')
        .set('x-api-key', options.apiKey)
        .expect(405)
        .expect(
          'the some_formula formula does not apply to contract valid_contract'
        )

      options.mockFormula({
        filter: {
          codeIdsKeys: ['dao-core'],
        },
      })
      const response = await request(app.callback())
        .get('/contract/valid_contract/some_formula')
        .set('x-api-key', options.apiKey)
      expect(response.text).not.toBe(
        'the some_formula formula does not apply to contract valid_contract'
      )
    })

    it('prevents dynamic formula from being computed over range', async () => {
      options.mockFormula({
        dynamic: true,
      })
      await request(app.callback())
        .get('/contract/valid_contract/formula?blocks=1:1..2:2')
        .set('x-api-key', options.apiKey)
        .expect(400)
        .expect(
          'cannot compute dynamic formula over a range (compute it for a specific block/time instead)'
        )

      options.mockFormula({
        dynamic: true,
      })
      await request(app.callback())
        .get('/contract/valid_contract/formula?times=1..2')
        .set('x-api-key', options.apiKey)
        .expect(400)
        .expect(
          'cannot compute dynamic formula over a range (compute it for a specific block/time instead)'
        )

      options.mockFormula({
        dynamic: false,
      })
      const response = await request(app.callback())
        .get('/contract/valid_contract/formula?blocks=1:1..2:2')
        .set('x-api-key', options.apiKey)
      expect(response.text).not.toBe(
        'cannot compute dynamic formula over a range (compute it for a specific block/time instead)'
      )
    })
  })
}
