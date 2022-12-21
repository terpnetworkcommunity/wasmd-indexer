import axios from 'axios'
import { Op, Sequelize } from 'sequelize'

import { loadConfig } from '../config'
import { loadDb } from '../db'
import { Computation, Contract, Event, State } from '../db/models'
import { Exporter } from './types'

export const exporter: Exporter = async (events) => {
  await loadDb()

  const uniqueContracts = [
    ...new Set(events.map((event) => event.contractAddress)),
  ]

  // Ensure contract exists before creating events. `address` is unique.
  await Contract.bulkCreate(
    uniqueContracts.map((address) => ({
      address,
      codeId: events.find((event) => event.contractAddress === address)!.codeId,
    })),
    {
      ignoreDuplicates: true,
    }
  )

  const eventRecords = events.map((event) => ({
    contractAddress: event.contractAddress,
    blockHeight: event.blockHeight,
    blockTimeUnixMs: Math.round(event.blockTimeUnixMicro / 1000),
    blockTimestamp: new Date(event.blockTimeUnixMicro / 1000),
    // Convert base64 key to comma-separated list of bytes. See explanation in
    // `Event` model for more information.
    key: Buffer.from(event.key, 'base64').join(','),
    // Convert base64 value to utf-8 string, if present.
    value: event.value && Buffer.from(event.value, 'base64').toString('utf-8'),
    delete: event.delete,
  }))

  // Unique index on [blockHeight, contractAddress, key] ensures that we don't
  // insert duplicate events. If we encounter a duplicate, we update the `value`
  // and `delete` field in case event processing for a block was batched
  // separately.
  await Event.bulkCreate(eventRecords, {
    updateOnDuplicate: ['value', 'delete'],
  })

  // Remove computations that depend on changed keys.
  const eventKeys = eventRecords.map(
    (event) => `${event.contractAddress}:${event.key}`
  )
  await Computation.destroy({
    where: {
      [Op.or]: {
        // Any dependent keys that overlap with changed keys.
        dependentKeys: {
          [Op.overlap]: eventKeys,
        },
        // Any dependent keys that are map prefixes of changed keys. This is
        // safe because keys are encoded as comma-separated numbers and are
        // prefixed with an alphanumeric contract address and a colon, so
        // they cannot contain single quotes and perform SQL injection.
        id: {
          [Op.in]: Sequelize.literal(`
            (
              SELECT
                "Computations".id
              FROM
                "Computations",
                unnest("Computations"."dependentKeys") prefixes(x)
              INNER JOIN
                unnest(ARRAY['${eventKeys.join("','")}']) keys(x)
              ON
                keys.x LIKE prefixes.x || '%'
              WHERE
                prefixes.x LIKE '%,'
            )
          `),
        },
      },
    },
  })

  // Return updated contracts.
  return Contract.findAll({
    where: {
      address: uniqueContracts,
    },
  })
}

// Update db state. Returns latest block height for log.
export const updateState = async (): Promise<number> => {
  const { statusEndpoint } = await loadConfig()
  const { data } = await axios.get(statusEndpoint, {
    // https://stackoverflow.com/a/74735197
    headers: { 'Accept-Encoding': 'gzip,deflate,compress' },
  })

  const latestBlockHeight = Number(data.result.sync_info.latest_block_height)
  const latestBlockTimeUnixMs = Date.parse(
    data.result.sync_info.latest_block_time
  )

  // Update state singleton with latest information.
  await State.upsert({
    singleton: true,
    latestBlockHeight,
    latestBlockTimeUnixMs,
  })

  return latestBlockHeight
}
