import { randomUUID } from 'crypto'

import Router from '@koa/router'
import { DefaultContext } from 'koa'

import {
  AccountCodeIdSet,
  AccountKey,
  AccountWebhook,
  AccountWebhookStateKeyType,
} from '@/db'

import { AccountState } from './types'

type UpdateWebhookRequest = Partial<
  Pick<
    AccountWebhook,
    | 'description'
    | 'url'
    | 'onlyFirstSet'
    | 'contractAddresses'
    | 'stateKey'
    | 'stateKeyType'
  > & {
    accountKeyId: number
    codeIdSetIds: number[]
    resetSecret: boolean
  }
>

type UpdateWebhookResponse =
  | undefined
  | {
      error: string
    }

export const updateWebhook: Router.Middleware<
  AccountState,
  DefaultContext,
  UpdateWebhookResponse
> = async (ctx) => {
  const id = ctx.params.id

  const webhook = await AccountWebhook.findByPk(id, {
    include: AccountCodeIdSet,
  })
  // Verify webhook exists and belongs to the account.
  if (!webhook || webhook.accountPublicKey !== ctx.state.account.publicKey) {
    ctx.status = 404
    ctx.body = {
      error: 'Webhook not found.',
    }
    return
  }

  const body: UpdateWebhookRequest = ctx.request.body

  // Validate key ID.
  if ('accountKeyId' in body) {
    if (typeof body.accountKeyId !== 'number') {
      ctx.status = 400
      ctx.body = {
        error: 'Invalid key ID.',
      }
      return
    }
    const accountKey = await AccountKey.findByPk(body.accountKeyId)
    // Verify key exists and belongs to the account.
    if (
      !accountKey ||
      accountKey.accountPublicKey !== ctx.state.account.publicKey
    ) {
      ctx.status = 400
      ctx.body = {
        error: 'Invalid key.',
      }
      return
    }

    webhook.accountKeyId = body.accountKeyId
  }

  if ('description' in body) {
    if (
      typeof body.description === 'string' &&
      body.description.trim().length > 255
    ) {
      ctx.status = 400
      ctx.body = {
        error: 'Description too long.',
      }
      return
    }

    webhook.description = body.description?.trim() || null
  }

  if ('url' in body && typeof body.url === 'string') {
    body.url = body.url.trim()
    try {
      new URL(body.url)
    } catch (err) {
      ctx.status = 400
      ctx.body = {
        error: 'Invalid URL.',
      }
      return
    }

    webhook.url = body.url
  }

  if ('onlyFirstSet' in body) {
    webhook.onlyFirstSet = !!body.onlyFirstSet
  }

  if ('codeIdSetIds' in body) {
    const codeIdSets =
      Array.isArray(body.codeIdSetIds) && body.codeIdSetIds.length > 0
        ? await ctx.state.account.$get('codeIdSets', {
            where: {
              id: body.codeIdSetIds,
            },
          })
        : []

    if (codeIdSets.length !== body.codeIdSetIds?.length) {
      ctx.status = 400
      ctx.body = {
        error: 'Invalid code ID sets.',
      }
      return
    }
  }

  if ('contractAddresses' in body) {
    body.contractAddresses =
      body.contractAddresses && Array.isArray(body.contractAddresses)
        ? body.contractAddresses
            .map((address) =>
              typeof address === 'string' ? address.trim() : ''
            )
            .filter(Boolean)
        : null
    if (body.contractAddresses?.length === 0) {
      body.contractAddresses = null
    }

    webhook.contractAddresses = body.contractAddresses
  }

  if ('stateKey' in body) {
    if (typeof body.stateKey !== 'string' && body.stateKey !== null) {
      ctx.status = 400
      ctx.body = {
        error: 'Invalid state key.',
      }
      return
    }

    webhook.stateKey = body.stateKey?.trim() || null
  }

  // Validate state key type if state key is used.
  if (webhook.stateKey) {
    if ('stateKeyType' in body) {
      if (
        !body.stateKeyType ||
        typeof body.stateKeyType !== 'string' ||
        !Object.values(AccountWebhookStateKeyType).includes(
          body.stateKeyType as any
        )
      ) {
        ctx.status = 400
        ctx.body = {
          error: 'Invalid state key type.',
        }
        return
      }

      webhook.stateKeyType = body.stateKeyType
    }

    if (!webhook.stateKeyType) {
      ctx.status = 400
      ctx.body = {
        error: 'Invalid state key type.',
      }
      return
    }
  }

  // Reset secret if requested.
  if (body.resetSecret) {
    webhook.secret = randomUUID()
  }

  // Validate at least one filter is present.
  if (
    !webhook.contractAddresses?.length &&
    !webhook.stateKey &&
    // If code ID sets are being updated, check the update instead of existing.
    !('codeIdSetIds' in body ? body.codeIdSetIds : webhook.codeIdSets)?.length
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'At least one filter is required.',
    }
    return
  }

  await webhook.save()
  // If code ID sets are present, update them on the webhook, clearing if empty.
  if ('codeIdSetIds' in body) {
    await webhook.$set('codeIdSets', body.codeIdSetIds || [])
  }

  ctx.status = 204
}
