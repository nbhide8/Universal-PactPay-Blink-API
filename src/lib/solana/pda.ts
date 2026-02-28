import { createHash } from 'crypto';
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('Edmq5WTFJL5gtwMmD9HdtJ5N14ivXMP4vprvPxRkFZRJ');

/**
 * Hash a string using SHA-256 (for PDA derivation)
 */
export const hashString = (input: string): Buffer => {
  return createHash('sha256').update(input).digest();
};

/**
 * Derive the escrow PDA for a room
 */
export const getRoomEscrowPDA = (roomId: string): PublicKey => {
  const roomHash = hashString(roomId);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), roomHash],
    PROGRAM_ID
  );
  return pda;
};

/**
 * Derive a stake record PDA for a participant in a room
 */
export const getStakeRecordPDA = (roomId: string, participantId: string): PublicKey => {
  const roomHash = hashString(roomId);
  const participantHash = hashString(participantId);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('stake'), roomHash, participantHash],
    PROGRAM_ID
  );
  return pda;
};
