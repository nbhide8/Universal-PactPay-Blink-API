/**
 * IDL for StakeGuard Anchor program.
 * Generated manually from contracts/stakeguard.rs — replace with the
 * output of `anchor build` (target/idl/stakeguard.json) once the
 * program is compiled.
 *
 * Instruction discriminators = sha256("global:<snake_case_fn_name>")[0..8]
 * Account discriminators     = sha256("account:<PascalCaseName>")[0..8]
 */
export const IDL = {
  address: '4ixiwwbedA1p3s79zgPmqf9C2JKLJ1WkEDVtCw9yQSxf',
  metadata: {
    name: 'stakeguard',
    version: '0.1.0',
    spec: '0.1.0',
    description: 'StakeGuard trustless escrow platform',
  },

  // ─── Instructions ───────────────────────────────────────────────────────────
  instructions: [
    {
      name: 'initializeRoom',
      discriminator: [216, 42, 137, 161, 61, 72, 154, 238],
      accounts: [
        {
          name: 'escrowAccount',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: Array.from(Buffer.from('escrow')) },
              { kind: 'arg', path: 'roomHash' },
            ],
          },
        },
        { name: 'initializer', writable: true, signer: true },
        { name: 'systemProgram', address: '11111111111111111111111111111111' },
      ],
      args: [
        { name: 'roomHash', type: { array: ['u8', 32] } },
        { name: 'roomId', type: 'string' },
        { name: 'creatorPubkey', type: 'pubkey' },
        { name: 'creatorStakeAmount', type: 'u64' },
        { name: 'joinerStakeAmount', type: 'u64' },
      ],
    },

    {
      name: 'stake',
      discriminator: [206, 176, 202, 18, 200, 209, 179, 108],
      accounts: [
        {
          name: 'escrowAccount',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: Array.from(Buffer.from('escrow')) },
              { kind: 'arg', path: 'roomHash' },
            ],
          },
        },
        {
          name: 'stakeRecord',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: Array.from(Buffer.from('stake')) },
              { kind: 'arg', path: 'roomHash' },
              { kind: 'arg', path: 'participantHash' },
            ],
          },
        },
        { name: 'staker', writable: true, signer: true },
        { name: 'systemProgram', address: '11111111111111111111111111111111' },
      ],
      args: [
        { name: 'roomHash', type: { array: ['u8', 32] } },
        { name: 'participantHash', type: { array: ['u8', 32] } },
        { name: 'roomId', type: 'string' },
        { name: 'participantId', type: 'string' },
        { name: 'amount', type: 'u64' },
        { name: 'isCreator', type: 'bool' },
      ],
    },

    {
      name: 'approveResolve',
      discriminator: [100, 234, 124, 183, 248, 225, 40, 99],
      accounts: [
        {
          name: 'escrowAccount',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: Array.from(Buffer.from('escrow')) },
              { kind: 'arg', path: 'roomHash' },
            ],
          },
        },
        { name: 'signer', signer: true },
      ],
      args: [
        { name: 'roomHash', type: { array: ['u8', 32] } },
        { name: 'roomId', type: 'string' },
      ],
    },

    {
      name: 'resolve',
      discriminator: [246, 150, 236, 206, 108, 63, 58, 10],
      accounts: [
        {
          name: 'escrowAccount',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: Array.from(Buffer.from('escrow')) },
              { kind: 'arg', path: 'roomHash' },
            ],
          },
        },
        {
          name: 'creatorStakeRecord',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: Array.from(Buffer.from('stake')) },
              { kind: 'arg', path: 'roomHash' },
              { kind: 'arg', path: 'creatorParticipantHash' },
            ],
          },
        },
        {
          name: 'joinerStakeRecord',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: Array.from(Buffer.from('stake')) },
              { kind: 'arg', path: 'roomHash' },
              { kind: 'arg', path: 'joinerParticipantHash' },
            ],
          },
        },
        { name: 'signer', signer: true },
        { name: 'creatorWallet', writable: true },
        { name: 'joinerWallet', writable: true },
      ],
      args: [
        { name: 'roomHash', type: { array: ['u8', 32] } },
        { name: 'roomId', type: 'string' },
        { name: 'creatorParticipantHash', type: { array: ['u8', 32] } },
        { name: 'joinerParticipantHash', type: { array: ['u8', 32] } },
      ],
    },

    {
      name: 'slash',
      discriminator: [204, 141, 18, 161, 8, 177, 92, 142],
      accounts: [
        {
          name: 'escrowAccount',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: Array.from(Buffer.from('escrow')) },
              { kind: 'arg', path: 'roomHash' },
            ],
          },
        },
        {
          name: 'creatorStakeRecord',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: Array.from(Buffer.from('stake')) },
              { kind: 'arg', path: 'roomHash' },
              { kind: 'arg', path: 'creatorParticipantHash' },
            ],
          },
        },
        {
          name: 'joinerStakeRecord',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: Array.from(Buffer.from('stake')) },
              { kind: 'arg', path: 'roomHash' },
              { kind: 'arg', path: 'joinerParticipantHash' },
            ],
          },
        },
        { name: 'slasher', signer: true },
        { name: 'penaltyWallet', writable: true },
      ],
      args: [
        { name: 'roomHash', type: { array: ['u8', 32] } },
        { name: 'roomId', type: 'string' },
        { name: 'creatorParticipantHash', type: { array: ['u8', 32] } },
        { name: 'joinerParticipantHash', type: { array: ['u8', 32] } },
      ],
    },

    {
      name: 'cancelRoom',
      discriminator: [91, 107, 215, 178, 200, 224, 241, 237],
      accounts: [
        {
          name: 'escrowAccount',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: Array.from(Buffer.from('escrow')) },
              { kind: 'arg', path: 'roomHash' },
            ],
          },
        },
        { name: 'creator', writable: true, signer: true },
        { name: 'joinerWallet', writable: true, optional: true },
      ],
      args: [
        { name: 'roomHash', type: { array: ['u8', 32] } },
        { name: 'roomId', type: 'string' },
      ],
    },
  ],

  // ─── Accounts ────────────────────────────────────────────────────────────────
  // Anchor 0.30 format: only name + discriminator here; struct defs go in types[]
  accounts: [
    { name: 'RoomEscrow', discriminator: [217, 21, 224, 203, 129, 4, 248, 150] },
    { name: 'StakeRecord', discriminator: [174, 163, 11, 208, 150, 236, 11, 205] },
  ],

  // ─── Events ──────────────────────────────────────────────────────────────────
  // Anchor 0.30 format: only name + discriminator; struct defs go in types[]
  events: [
    { name: 'RoomInitialized', discriminator: [0, 0, 0, 0, 0, 0, 0, 0] },
    { name: 'Staked', discriminator: [0, 0, 0, 0, 0, 0, 0, 1] },
    { name: 'ResolveApproved', discriminator: [0, 0, 0, 0, 0, 0, 0, 2] },
    { name: 'RoomResolved', discriminator: [0, 0, 0, 0, 0, 0, 0, 3] },
    { name: 'RoomSlashed', discriminator: [0, 0, 0, 0, 0, 0, 0, 4] },
    { name: 'RoomCancelled', discriminator: [0, 0, 0, 0, 0, 0, 0, 5] },
  ],

  // ─── Errors ──────────────────────────────────────────────────────────────────
  errors: [
    { code: 6000, name: 'InvalidAmount', msg: 'Invalid amount: must be greater than 0' },
    { code: 6001, name: 'CreatorStakeTooLow', msg: 'Creator stake must be >= joiner stake (skin in the game)' },
    { code: 6002, name: 'EscrowNotActive', msg: 'Escrow is not active' },
    { code: 6003, name: 'InvalidRoom', msg: 'Invalid room ID' },
    { code: 6004, name: 'InvalidParticipant', msg: 'Invalid participant' },
    { code: 6005, name: 'UnauthorizedStaker', msg: 'Unauthorized staker' },
    { code: 6006, name: 'StakeExceedsRequired', msg: 'Stake exceeds required amount' },
    { code: 6007, name: 'NotFullyFunded', msg: 'Room is not fully funded yet' },
    { code: 6008, name: 'AlreadyFullyFunded', msg: 'Room is already fully funded, cannot cancel' },
    { code: 6009, name: 'UnauthorizedSigner', msg: 'Unauthorized signer' },
    { code: 6010, name: 'BothPartiesMustApprove', msg: 'Both parties must approve before resolving' },
    { code: 6011, name: 'AlreadyApproved', msg: 'Already approved' },
    { code: 6012, name: 'InvalidPenaltyWallet', msg: 'Invalid penalty wallet' },
    { code: 6013, name: 'InsufficientFunds', msg: 'Insufficient funds' },
    { code: 6014, name: 'ArithmeticOverflow', msg: 'Arithmetic overflow' },
  ],

  // ─── Types ───────────────────────────────────────────────────────────────────
  types: [
    {
      name: 'RoomEscrow',
      type: {
        kind: 'struct',
        fields: [
          { name: 'roomId', type: 'string' },
          { name: 'creator', type: 'pubkey' },
          { name: 'joiner', type: 'pubkey' },
          { name: 'creatorStakeAmount', type: 'u64' },
          { name: 'joinerStakeAmount', type: 'u64' },
          { name: 'creatorStaked', type: 'u64' },
          { name: 'joinerStaked', type: 'u64' },
          { name: 'totalStaked', type: 'u64' },
          { name: 'isActive', type: 'bool' },
          { name: 'isFullyFunded', type: 'bool' },
          { name: 'creatorApprovedResolve', type: 'bool' },
          { name: 'joinerApprovedResolve', type: 'bool' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
    {
      name: 'StakeRecord',
      type: {
        kind: 'struct',
        fields: [
          { name: 'participantId', type: 'string' },
          { name: 'roomId', type: 'string' },
          { name: 'staker', type: 'pubkey' },
          { name: 'amount', type: 'u64' },
          { name: 'isCreator', type: 'bool' },
          { name: 'isActive', type: 'bool' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
    {
      name: 'RoomInitialized',
      type: {
        kind: 'struct',
        fields: [
          { name: 'roomId', type: 'string' },
          { name: 'creator', type: 'pubkey' },
          { name: 'creatorStakeAmount', type: 'u64' },
          { name: 'joinerStakeAmount', type: 'u64' },
        ],
      },
    },
    {
      name: 'Staked',
      type: {
        kind: 'struct',
        fields: [
          { name: 'roomId', type: 'string' },
          { name: 'participantId', type: 'string' },
          { name: 'staker', type: 'pubkey' },
          { name: 'amount', type: 'u64' },
          { name: 'isCreator', type: 'bool' },
          { name: 'totalStaked', type: 'u64' },
          { name: 'isFullyFunded', type: 'bool' },
        ],
      },
    },
    {
      name: 'ResolveApproved',
      type: {
        kind: 'struct',
        fields: [
          { name: 'roomId', type: 'string' },
          { name: 'approver', type: 'pubkey' },
          { name: 'creatorApproved', type: 'bool' },
          { name: 'joinerApproved', type: 'bool' },
        ],
      },
    },
    {
      name: 'RoomResolved',
      type: {
        kind: 'struct',
        fields: [
          { name: 'roomId', type: 'string' },
          { name: 'creatorReturned', type: 'u64' },
          { name: 'joinerReturned', type: 'u64' },
        ],
      },
    },
    {
      name: 'RoomSlashed',
      type: {
        kind: 'struct',
        fields: [
          { name: 'roomId', type: 'string' },
          { name: 'slashedBy', type: 'pubkey' },
          { name: 'creatorLost', type: 'u64' },
          { name: 'joinerLost', type: 'u64' },
          { name: 'totalPenalty', type: 'u64' },
        ],
      },
    },
    {
      name: 'RoomCancelled',
      type: {
        kind: 'struct',
        fields: [
          { name: 'roomId', type: 'string' },
          { name: 'cancelledBy', type: 'pubkey' },
        ],
      },
    },
  ],
} as const;

export type StakeguardIDL = typeof IDL;
