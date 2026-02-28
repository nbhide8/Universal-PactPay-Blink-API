use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("Edmq5WTFJL5gtwMmD9HdtJ5N14ivXMP4vprvPxRkFZRJ");

// Fixed penalty wallet - hardcoded in contract. All slashed funds go here.
const PENALTY_WALLET: &str = "2c8QGXM2tRMh7yb1Zva48ZmQTPMmLZCu159x2hscxxwv";

fn get_penalty_wallet() -> Pubkey {
    Pubkey::try_from(PENALTY_WALLET).unwrap()
}

// Helper function to hash strings for PDA generation
fn hash_string(input: &str) -> [u8; 32] {
    use anchor_lang::solana_program::hash::{hash, Hash};
    let hash_result: Hash = hash(input.as_bytes());
    hash_result.to_bytes()
}

#[program]
pub mod stakeguard {
    use super::*;

    // ========================================================================
    // INITIALIZE ROOM ESCROW
    // Creates the escrow PDA for a room. Called by the room creator.
    // ========================================================================
    pub fn initialize_room(
        ctx: Context<InitializeRoom>,
        room_hash: [u8; 32],
        room_id: String,
        creator_pubkey: Pubkey,
        creator_stake_amount: u64,
        joiner_stake_amount: u64,
    ) -> Result<()> {
        require!(creator_stake_amount > 0, StakeGuardError::InvalidAmount);
        require!(joiner_stake_amount > 0, StakeGuardError::InvalidAmount);
        require!(
            creator_stake_amount >= joiner_stake_amount,
            StakeGuardError::CreatorStakeTooLow
        );

        let escrow = &mut ctx.accounts.escrow_account;

        escrow.room_id = room_id.clone();
        escrow.creator = creator_pubkey;
        escrow.joiner = Pubkey::default(); // Set when joiner stakes
        escrow.creator_stake_amount = creator_stake_amount;
        escrow.joiner_stake_amount = joiner_stake_amount;
        escrow.creator_staked = 0;
        escrow.joiner_staked = 0;
        escrow.total_staked = 0;
        escrow.is_active = true;
        escrow.is_fully_funded = false;
        escrow.creator_approved_resolve = false;
        escrow.joiner_approved_resolve = false;
        escrow.bump = ctx.bumps.escrow_account;

        emit!(RoomInitialized {
            room_id,
            creator: creator_pubkey,
            creator_stake_amount,
            joiner_stake_amount,
        });

        Ok(())
    }

    // ========================================================================
    // STAKE (for either creator or joiner)
    // Each participant stakes their SOL into the escrow PDA.
    // Uses participant_hash to derive unique stake record PDAs.
    // ========================================================================
    pub fn stake(
        ctx: Context<StakeForRoom>,
        room_hash: [u8; 32],
        participant_hash: [u8; 32],
        room_id: String,
        participant_id: String,
        amount: u64,
        is_creator: bool,
    ) -> Result<()> {
        require!(amount > 0, StakeGuardError::InvalidAmount);
        require!(!room_id.is_empty(), StakeGuardError::InvalidRoom);
        require!(!participant_id.is_empty(), StakeGuardError::InvalidParticipant);

        let escrow = &mut ctx.accounts.escrow_account;
        let stake_record = &mut ctx.accounts.stake_record;

        require!(escrow.is_active, StakeGuardError::EscrowNotActive);
        require!(escrow.room_id == room_id, StakeGuardError::InvalidRoom);

        if is_creator {
            require!(
                ctx.accounts.staker.key() == escrow.creator,
                StakeGuardError::UnauthorizedStaker
            );
            require!(
                escrow.creator_staked + amount <= escrow.creator_stake_amount,
                StakeGuardError::StakeExceedsRequired
            );
            escrow.creator_staked = escrow.creator_staked
                .checked_add(amount)
                .ok_or(StakeGuardError::ArithmeticOverflow)?;
        } else {
            // First time joiner stakes, record their pubkey
            if escrow.joiner == Pubkey::default() {
                escrow.joiner = ctx.accounts.staker.key();
            }
            require!(
                ctx.accounts.staker.key() == escrow.joiner,
                StakeGuardError::UnauthorizedStaker
            );
            require!(
                escrow.joiner_staked + amount <= escrow.joiner_stake_amount,
                StakeGuardError::StakeExceedsRequired
            );
            escrow.joiner_staked = escrow.joiner_staked
                .checked_add(amount)
                .ok_or(StakeGuardError::ArithmeticOverflow)?;
        }

        // Update stake record
        stake_record.participant_id = participant_id.clone();
        stake_record.room_id = room_id.clone();
        stake_record.staker = ctx.accounts.staker.key();
        stake_record.amount = stake_record
            .amount
            .checked_add(amount)
            .ok_or(StakeGuardError::ArithmeticOverflow)?;
        stake_record.is_creator = is_creator;
        stake_record.is_active = true;
        stake_record.bump = ctx.bumps.stake_record;

        // Update total staked
        escrow.total_staked = escrow
            .total_staked
            .checked_add(amount)
            .ok_or(StakeGuardError::ArithmeticOverflow)?;

        // Check if room is now fully funded
        if escrow.creator_staked >= escrow.creator_stake_amount
            && escrow.joiner_staked >= escrow.joiner_stake_amount
        {
            escrow.is_fully_funded = true;
        }

        // Transfer SOL from staker to escrow PDA
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.staker.to_account_info(),
                to: ctx.accounts.escrow_account.to_account_info(),
            },
        );
        system_program::transfer(cpi_context, amount)?;

        emit!(Staked {
            room_id,
            participant_id,
            staker: ctx.accounts.staker.key(),
            amount,
            is_creator,
            total_staked: escrow.total_staked,
            is_fully_funded: escrow.is_fully_funded,
        });

        Ok(())
    }

    // ========================================================================
    // APPROVE RESOLVE (both parties must call this)
    // When both approve, the contract can be resolved.
    // ========================================================================
    pub fn approve_resolve(
        ctx: Context<ApproveResolve>,
        room_hash: [u8; 32],
        room_id: String,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;

        require!(escrow.is_active, StakeGuardError::EscrowNotActive);
        require!(escrow.is_fully_funded, StakeGuardError::NotFullyFunded);
        require!(escrow.room_id == room_id, StakeGuardError::InvalidRoom);

        let signer = ctx.accounts.signer.key();

        if signer == escrow.creator {
            require!(
                !escrow.creator_approved_resolve,
                StakeGuardError::AlreadyApproved
            );
            escrow.creator_approved_resolve = true;
        } else if signer == escrow.joiner {
            require!(
                !escrow.joiner_approved_resolve,
                StakeGuardError::AlreadyApproved
            );
            escrow.joiner_approved_resolve = true;
        } else {
            return Err(StakeGuardError::UnauthorizedSigner.into());
        }

        emit!(ResolveApproved {
            room_id,
            approver: signer,
            creator_approved: escrow.creator_approved_resolve,
            joiner_approved: escrow.joiner_approved_resolve,
        });

        Ok(())
    }

    // ========================================================================
    // RESOLVE (execute after both parties approved)
    // Returns stakes to both parties. Both get their money back.
    // ========================================================================
    pub fn resolve(
        ctx: Context<ResolveRoom>,
        room_hash: [u8; 32],
        room_id: String,
        creator_participant_hash: [u8; 32],
        joiner_participant_hash: [u8; 32],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;

        require!(escrow.is_active, StakeGuardError::EscrowNotActive);
        require!(escrow.is_fully_funded, StakeGuardError::NotFullyFunded);
        require!(escrow.room_id == room_id, StakeGuardError::InvalidRoom);

        // Both parties must have approved
        require!(
            escrow.creator_approved_resolve && escrow.joiner_approved_resolve,
            StakeGuardError::BothPartiesMustApprove
        );

        let creator_stake_record = &mut ctx.accounts.creator_stake_record;
        let joiner_stake_record = &mut ctx.accounts.joiner_stake_record;

        let creator_amount = creator_stake_record.amount;
        let joiner_amount = joiner_stake_record.amount;
        let total = creator_amount + joiner_amount;

        msg!("Resolving room: {}", room_id);
        msg!("Creator gets back: {}", creator_amount);
        msg!("Joiner gets back: {}", joiner_amount);

        // Deactivate records
        escrow.is_active = false;
        creator_stake_record.is_active = false;
        joiner_stake_record.is_active = false;
        creator_stake_record.amount = 0;
        joiner_stake_record.amount = 0;
        escrow.total_staked = 0;

        // Transfer creator's stake back
        if creator_amount > 0 {
            **ctx
                .accounts
                .escrow_account
                .to_account_info()
                .try_borrow_mut_lamports()? -= creator_amount;
            **ctx
                .accounts
                .creator_wallet
                .to_account_info()
                .try_borrow_mut_lamports()? += creator_amount;
        }

        // Transfer joiner's stake back
        if joiner_amount > 0 {
            **ctx
                .accounts
                .escrow_account
                .to_account_info()
                .try_borrow_mut_lamports()? -= joiner_amount;
            **ctx
                .accounts
                .joiner_wallet
                .to_account_info()
                .try_borrow_mut_lamports()? += joiner_amount;
        }

        emit!(RoomResolved {
            room_id,
            creator_returned: creator_amount,
            joiner_returned: joiner_amount,
        });

        Ok(())
    }

    // ========================================================================
    // SLASH (either party can call - both lose their stakes)
    // Sends ALL staked funds to the penalty wallet.
    // The creator loses MORE because they staked more.
    // ========================================================================
    pub fn slash(
        ctx: Context<SlashRoom>,
        room_hash: [u8; 32],
        room_id: String,
        creator_participant_hash: [u8; 32],
        joiner_participant_hash: [u8; 32],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;

        require!(escrow.is_active, StakeGuardError::EscrowNotActive);
        require!(escrow.is_fully_funded, StakeGuardError::NotFullyFunded);
        require!(escrow.room_id == room_id, StakeGuardError::InvalidRoom);

        let signer = ctx.accounts.slasher.key();
        require!(
            signer == escrow.creator || signer == escrow.joiner,
            StakeGuardError::UnauthorizedSigner
        );

        let creator_stake_record = &mut ctx.accounts.creator_stake_record;
        let joiner_stake_record = &mut ctx.accounts.joiner_stake_record;

        let creator_amount = creator_stake_record.amount;
        let joiner_amount = joiner_stake_record.amount;
        let total_slash = creator_amount + joiner_amount;

        msg!("=== SLASH ===");
        msg!("Slashed by: {}", signer);
        msg!("Creator loses: {}", creator_amount);
        msg!("Joiner loses: {}", joiner_amount);
        msg!("Total to penalty wallet: {}", total_slash);

        require!(total_slash > 0, StakeGuardError::InsufficientFunds);

        // Deactivate everything
        escrow.is_active = false;
        creator_stake_record.is_active = false;
        joiner_stake_record.is_active = false;
        creator_stake_record.amount = 0;
        joiner_stake_record.amount = 0;
        escrow.total_staked = 0;

        // Transfer ALL funds to penalty wallet
        **ctx
            .accounts
            .escrow_account
            .to_account_info()
            .try_borrow_mut_lamports()? -= total_slash;
        **ctx
            .accounts
            .penalty_wallet
            .to_account_info()
            .try_borrow_mut_lamports()? += total_slash;

        emit!(RoomSlashed {
            room_id,
            slashed_by: signer,
            creator_lost: creator_amount,
            joiner_lost: joiner_amount,
            total_penalty: total_slash,
        });

        Ok(())
    }

    // ========================================================================
    // CANCEL (before room is fully funded, creator can cancel)
    // Returns any staked funds to their respective owners.
    // ========================================================================
    pub fn cancel_room(
        ctx: Context<CancelRoom>,
        room_hash: [u8; 32],
        room_id: String,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;

        require!(escrow.is_active, StakeGuardError::EscrowNotActive);
        require!(!escrow.is_fully_funded, StakeGuardError::AlreadyFullyFunded);
        require!(escrow.room_id == room_id, StakeGuardError::InvalidRoom);
        require!(
            ctx.accounts.creator.key() == escrow.creator,
            StakeGuardError::UnauthorizedSigner
        );

        escrow.is_active = false;

        // Return any staked creator funds
        if escrow.creator_staked > 0 {
            let amount = escrow.creator_staked;
            **ctx
                .accounts
                .escrow_account
                .to_account_info()
                .try_borrow_mut_lamports()? -= amount;
            **ctx
                .accounts
                .creator
                .to_account_info()
                .try_borrow_mut_lamports()? += amount;
            escrow.creator_staked = 0;
        }

        // Return any staked joiner funds (if joiner exists)
        if escrow.joiner_staked > 0 && escrow.joiner != Pubkey::default() {
            let amount = escrow.joiner_staked;
            **ctx
                .accounts
                .escrow_account
                .to_account_info()
                .try_borrow_mut_lamports()? -= amount;
            // Note: joiner_wallet must be provided
            if let Some(joiner_wallet) = &ctx.accounts.joiner_wallet {
                **joiner_wallet.to_account_info().try_borrow_mut_lamports()? += amount;
            }
            escrow.joiner_staked = 0;
        }

        escrow.total_staked = 0;

        emit!(RoomCancelled {
            room_id,
            cancelled_by: ctx.accounts.creator.key(),
        });

        Ok(())
    }
}

// ============================================================================
// ACCOUNT CONTEXTS
// ============================================================================

#[derive(Accounts)]
#[instruction(room_hash: [u8; 32], room_id: String, creator_pubkey: Pubkey, creator_stake_amount: u64, joiner_stake_amount: u64)]
pub struct InitializeRoom<'info> {
    #[account(
        init,
        payer = initializer,
        seeds = [b"escrow", room_hash.as_ref()],
        bump,
        space = 8 + RoomEscrow::INIT_SPACE
    )]
    pub escrow_account: Account<'info, RoomEscrow>,

    #[account(mut)]
    pub initializer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(room_hash: [u8; 32], participant_hash: [u8; 32], room_id: String, participant_id: String, amount: u64, is_creator: bool)]
pub struct StakeForRoom<'info> {
    #[account(
        mut,
        seeds = [b"escrow", room_hash.as_ref()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, RoomEscrow>,

    #[account(
        init_if_needed,
        payer = staker,
        seeds = [b"stake", room_hash.as_ref(), participant_hash.as_ref()],
        bump,
        space = 8 + StakeRecord::INIT_SPACE
    )]
    pub stake_record: Account<'info, StakeRecord>,

    #[account(mut)]
    pub staker: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(room_hash: [u8; 32], room_id: String)]
pub struct ApproveResolve<'info> {
    #[account(
        mut,
        seeds = [b"escrow", room_hash.as_ref()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, RoomEscrow>,

    pub signer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(room_hash: [u8; 32], room_id: String, creator_participant_hash: [u8; 32], joiner_participant_hash: [u8; 32])]
pub struct ResolveRoom<'info> {
    #[account(
        mut,
        seeds = [b"escrow", room_hash.as_ref()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, RoomEscrow>,

    #[account(
        mut,
        seeds = [b"stake", room_hash.as_ref(), creator_participant_hash.as_ref()],
        bump = creator_stake_record.bump
    )]
    pub creator_stake_record: Account<'info, StakeRecord>,

    #[account(
        mut,
        seeds = [b"stake", room_hash.as_ref(), joiner_participant_hash.as_ref()],
        bump = joiner_stake_record.bump
    )]
    pub joiner_stake_record: Account<'info, StakeRecord>,

    pub signer: Signer<'info>,

    /// CHECK: Creator's wallet to return funds to
    #[account(mut)]
    pub creator_wallet: AccountInfo<'info>,

    /// CHECK: Joiner's wallet to return funds to
    #[account(mut)]
    pub joiner_wallet: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(room_hash: [u8; 32], room_id: String, creator_participant_hash: [u8; 32], joiner_participant_hash: [u8; 32])]
pub struct SlashRoom<'info> {
    #[account(
        mut,
        seeds = [b"escrow", room_hash.as_ref()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, RoomEscrow>,

    #[account(
        mut,
        seeds = [b"stake", room_hash.as_ref(), creator_participant_hash.as_ref()],
        bump = creator_stake_record.bump
    )]
    pub creator_stake_record: Account<'info, StakeRecord>,

    #[account(
        mut,
        seeds = [b"stake", room_hash.as_ref(), joiner_participant_hash.as_ref()],
        bump = joiner_stake_record.bump
    )]
    pub joiner_stake_record: Account<'info, StakeRecord>,

    pub slasher: Signer<'info>,

    /// CHECK: Must be the hardcoded penalty wallet
    #[account(
        mut,
        constraint = penalty_wallet.key() == get_penalty_wallet() @ StakeGuardError::InvalidPenaltyWallet
    )]
    pub penalty_wallet: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(room_hash: [u8; 32], room_id: String)]
pub struct CancelRoom<'info> {
    #[account(
        mut,
        seeds = [b"escrow", room_hash.as_ref()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, RoomEscrow>,

    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: Optional joiner wallet to refund
    #[account(mut)]
    pub joiner_wallet: Option<AccountInfo<'info>>,
}

// ============================================================================
// ACCOUNT STRUCTS
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct RoomEscrow {
    #[max_len(50)]
    pub room_id: String,
    pub creator: Pubkey,
    pub joiner: Pubkey,
    pub creator_stake_amount: u64,   // Required stake from creator
    pub joiner_stake_amount: u64,    // Required stake from joiner
    pub creator_staked: u64,         // Actually staked by creator
    pub joiner_staked: u64,          // Actually staked by joiner
    pub total_staked: u64,
    pub is_active: bool,
    pub is_fully_funded: bool,
    pub creator_approved_resolve: bool,
    pub joiner_approved_resolve: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct StakeRecord {
    #[max_len(50)]
    pub participant_id: String,
    #[max_len(50)]
    pub room_id: String,
    pub staker: Pubkey,
    pub amount: u64,
    pub is_creator: bool,
    pub is_active: bool,
    pub bump: u8,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct RoomInitialized {
    pub room_id: String,
    pub creator: Pubkey,
    pub creator_stake_amount: u64,
    pub joiner_stake_amount: u64,
}

#[event]
pub struct Staked {
    pub room_id: String,
    pub participant_id: String,
    pub staker: Pubkey,
    pub amount: u64,
    pub is_creator: bool,
    pub total_staked: u64,
    pub is_fully_funded: bool,
}

#[event]
pub struct ResolveApproved {
    pub room_id: String,
    pub approver: Pubkey,
    pub creator_approved: bool,
    pub joiner_approved: bool,
}

#[event]
pub struct RoomResolved {
    pub room_id: String,
    pub creator_returned: u64,
    pub joiner_returned: u64,
}

#[event]
pub struct RoomSlashed {
    pub room_id: String,
    pub slashed_by: Pubkey,
    pub creator_lost: u64,
    pub joiner_lost: u64,
    pub total_penalty: u64,
}

#[event]
pub struct RoomCancelled {
    pub room_id: String,
    pub cancelled_by: Pubkey,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum StakeGuardError {
    #[msg("Invalid amount: must be greater than 0")]
    InvalidAmount,

    #[msg("Creator stake must be >= joiner stake (skin in the game)")]
    CreatorStakeTooLow,

    #[msg("Escrow is not active")]
    EscrowNotActive,

    #[msg("Invalid room ID")]
    InvalidRoom,

    #[msg("Invalid participant")]
    InvalidParticipant,

    #[msg("Unauthorized staker")]
    UnauthorizedStaker,

    #[msg("Stake exceeds required amount")]
    StakeExceedsRequired,

    #[msg("Room is not fully funded yet")]
    NotFullyFunded,

    #[msg("Room is already fully funded, cannot cancel")]
    AlreadyFullyFunded,

    #[msg("Unauthorized signer")]
    UnauthorizedSigner,

    #[msg("Both parties must approve before resolving")]
    BothPartiesMustApprove,

    #[msg("Already approved")]
    AlreadyApproved,

    #[msg("Invalid penalty wallet")]
    InvalidPenaltyWallet,

    #[msg("Insufficient funds")]
    InsufficientFunds,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
