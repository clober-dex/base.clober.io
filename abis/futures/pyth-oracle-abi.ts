export const PYTH_ORACLE_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes[]',
        name: 'updateData',
        type: 'bytes[]',
      },
    ],
    name: 'getUpdateFee',
    outputs: [
      {
        internalType: 'uint256',
        name: 'feeAmount',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const
