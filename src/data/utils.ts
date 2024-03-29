import {
  ContractFormula,
  FormulaType,
  GenericFormula,
  NestedFormulaMap,
  TypedFormula,
  ValidatorFormula,
  WalletFormula,
} from '@/core'

import {
  contractFormulas,
  genericFormulas,
  validatorFormulas,
  walletFormulas,
} from './formulas'

export const makeGetFormula =
  <T extends unknown>(formulas: NestedFormulaMap<T> | T | undefined) =>
  (formulaName: string): T | undefined => {
    const formulaPath = formulaName.split('/')
    const formulaBase = formulaPath
      .slice(0, -1)
      .reduce(
        (acc, key) =>
          acc && typeof acc === 'object' && key in acc
            ? (acc as NestedFormulaMap<T>)[key]
            : undefined,
        formulas
      )

    const formula =
      typeof formulaBase === 'object'
        ? (formulaBase as NestedFormulaMap<ContractFormula<any, any>>)[
            formulaPath[formulaPath.length - 1]
          ]
        : undefined

    return formula &&
      'compute' in formula &&
      typeof formula.compute === 'function'
      ? (formula as T)
      : undefined
  }

export const getContractFormula =
  makeGetFormula<ContractFormula>(contractFormulas)
export const getGenericFormula = makeGetFormula<GenericFormula>(genericFormulas)
export const getValidatorFormula =
  makeGetFormula<ValidatorFormula>(validatorFormulas)
export const getWalletFormula = makeGetFormula<WalletFormula>(walletFormulas)

export const getTypedFormula = (
  type: FormulaType,
  formulaName: string
): TypedFormula => {
  const typeAndFormula =
    type === FormulaType.Contract
      ? {
          type,
          formula: getContractFormula(formulaName),
        }
      : type === FormulaType.Generic
      ? {
          type,
          formula: getGenericFormula(formulaName),
        }
      : type === FormulaType.Validator
      ? {
          type,
          formula: getValidatorFormula(formulaName),
        }
      : type === FormulaType.Wallet
      ? {
          type,
          formula: getWalletFormula(formulaName),
        }
      : undefined

  if (!typeAndFormula?.formula) {
    throw new Error(`Formula not found: ${formulaName}`)
  }

  return {
    name: formulaName,
    ...typeAndFormula,
  } as TypedFormula
}
