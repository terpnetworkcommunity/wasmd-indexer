import { Formula } from '../../types'

interface StakerBalance {
  address: string
  balance: string
}

export const votingPower: Formula<string, { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) => (await get<string>(contractAddress, 'staked_balances', address)) || '0'

export const totalPower: Formula<string> = async ({ contractAddress, get }) =>
  (await get<string>(contractAddress, 'total_staked')) || '0'

export const dao: Formula<string | undefined> = async ({
  contractAddress,
  get,
}) => await get(contractAddress, 'dao')

export const claims: Formula<any[] | undefined, { address: string }> = async ({
  contractAddress,
  get,
  args: { address },
}) => await get<any[]>(contractAddress, 'claims', address)

export const config: Formula = async ({ contractAddress, get }) =>
  await get(contractAddress, 'config')

export const listStakers: Formula<
  StakerBalance[],
  {
    limit?: string
    startAfter?: string
  }
> = async ({ contractAddress, getMap, args: { limit, startAfter } }) => {
  const limitNum = limit ? Math.max(0, Number(limit)) : Infinity

  const stakers =
    (await getMap<string, string>(contractAddress, 'staked_balances')) ?? {}
  const stakes = Object.entries(stakers)
    // Ascending by address.
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([address]) => !startAfter || address.localeCompare(startAfter) > 0)
    .slice(0, limitNum)

  return stakes.map(([address, balance]) => ({
    address,
    balance,
  }))
}