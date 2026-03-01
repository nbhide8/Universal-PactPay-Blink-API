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
  address: 'Edmq5WTFJL5gtwMmD9HdtJ5N14ivXMP4vprvPxRkFZRJ',
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
      discriminator: [163, 134, 140, 192, 15, 6, 227, 23],
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
      discriminator: [254, 32, 189, 253, 3, 2, 123, 132],
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
      discriminator: [22, 195, 89, 204, 71, 180, 193, 12],
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
      discriminator: [162, 136, 9, 179, 86, 213, 52, 160],
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
      discriminator: [190, 242, 137, 27, 41, 18, 233, 37],
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
      discriminator: [103, 12, 207, 43, 105, 78, 220, 18],
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
  accounts: [
    {
      name: 'RoomEscrow',
      discriminator: [97, 208, 41, 253, 226, 168, 168, 50],
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
      discriminator: [199, 197, 62, 218, 192, 165, 173, 35],
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
  ],

  // ─── Events ──────────────────────────────────────────────────────────────────
  events: [
    {
      name: 'RoomInitialized',
      discriminator: [0, 0, 0, 0, 0, 0, 0, 0],
      fields: [
        { name: 'roomId', type: 'string' },
        { name: 'creator', type: 'pubkey' },
        { name: 'creatorStakeAmount', type: 'u64' },
        { name: 'joinerStakeAmount', type: 'u64' },
      ],
    },
    {
      name: 'Staked',
      discriminator: [0, 0, 0, 0, 0, 0, 0, 1],
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
    {
      name: 'ResolveApproved',
      discriminator: [0, 0, 0, 0, 0, 0, 0, 2],
      fields: [
        { name: 'roomId', type: 'string' },
        { name: 'approver', type: 'pubkey' },
        { name: 'creatorApproved', type: 'bool' },
        { name: 'joinerApproved', type: 'bool' },
      ],
    },
    {
      name: 'RoomResolved',
      discriminator: [0, 0, 0, 0, 0, 0, 0, 3],
      fields: [
        { name: 'roomId', type: 'string' },
        { name: 'creatorReturned', type: 'u64' },
        { name: 'joinerReturned', type: 'u64' },
      ],
    },
    {
      name: 'RoomSlashed',
      discriminator: [0, 0, 0, 0, 0, 0, 0, 4],
      fields: [
        { name: 'roomId', type: 'string' },
        { name: 'slashedBy', type: 'pubkey' },
        { name: 'creatorLost', type: 'u64' },
        { name: 'joinerLost', type: 'u64' },
        { name: 'totalPenalty', type: 'u64' },
      ],
    },
    {
      name: 'RoomCancelled',
      discriminator: [0, 0, 0, 0, 0, 0, 0, 5],
      fields: [
        { name: 'roomId', type: 'string' },
        { name: 'cancelledBy', type: 'pubkey' },
      ],
    },
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
} as const;

export type StakeguardIDL = typeof IDL;
