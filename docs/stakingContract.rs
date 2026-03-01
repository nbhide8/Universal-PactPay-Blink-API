// use anchor_lang::prelude::*;
// use anchor_lang::system_program;

// declare_id!("4ixiwwbedA1p3s79zgPmqf9C2JKLJ1WkEDVtCw9yQSxf");

// // Fixed penalty wallet - hardcoded in contract
// const PENALTY_WALLET: &str = "2c8QGXM2tRMh7yb1Zva48ZmQTPMmLZCu159x2hscxxwv";

// fn get_penalty_wallet() -> Pubkey {
//     Pubkey::try_from(PENALTY_WALLET).unwrap()
// }

// // Helper function to hash strings for PDA generation
// fn hashString(input: &str) -> [u8; 32] {
//     use anchor_lang::solana_program::hash::{hash, Hash};
//     let hash_result: Hash = hash(input.as_bytes());
//     hash_result.to_bytes()
// }

// #[program]
// pub mod escrow {
//     use super::*;

//     /// Initialize apartment escrow with apartment owner
//     pub fn initialize_apartment(
//         ctx: Context<InitializeApartment>,
//         apartment_hash: [u8; 32],
//         apartment_id: String,
//         apartment_owner: Pubkey,
//     ) -> Result<()> {
//         let escrow_account = &mut ctx.accounts.escrow_account;

//         escrow_account.apartment_id = apartment_id.clone();
//         escrow_account.lessor = apartment_owner;
//         escrow_account.total_staked = 0;
//         escrow_account.is_active = true;
//         escrow_account.bump = ctx.bumps.escrow_account;

//         emit!(EscrowInitialized {
//             apartment_id,
//             apartment_owner,
//         });

//         Ok(())
//     }

//     /// Stake SOL for a specific apartment (anyone can stake)
//     /// Escrow must be initialized first
//     pub fn stake_for_apartment(
//         ctx: Context<StakeForApartment>,
//         apartment_hash: [u8; 32],
//         amount: u64,
//         profile_hash: [u8; 32],
//         apartment_id: String,
//         tenant_profile_id: String,
//     ) -> Result<()> {
//         require!(amount > 0, EscrowError::InvalidAmount);
//         require!(!apartment_id.is_empty(), EscrowError::InvalidApartment);
//         require!(!tenant_profile_id.is_empty(), EscrowError::InvalidTenant);

//         let escrow_account = &mut ctx.accounts.escrow_account;
//         let stake_record = &mut ctx.accounts.stake_record;

//         // Require escrow to be already initialized
//         require!(escrow_account.is_active, EscrowError::EscrowNotActive);
//         require!(escrow_account.apartment_id == apartment_id, EscrowError::InvalidApartment);

//         // Simple key-value mapping: [profile_id + apartment_id] -> money_deposited
//         // Initialize or add to existing stake record
//         stake_record.tenant_profile_id = tenant_profile_id.clone();
//         stake_record.apartment_id = apartment_id.clone();
//         stake_record.staker = ctx.accounts.staker.key();
//         stake_record.amount = stake_record.amount
//             .checked_add(amount)
//             .ok_or(EscrowError::ArithmeticOverflow)?; // Add to existing if any
//         stake_record.is_active = true;
//         stake_record.bump = ctx.bumps.stake_record;

//         // Update total staked in escrow
//         escrow_account.total_staked = escrow_account.total_staked
//             .checked_add(amount)
//             .ok_or(EscrowError::ArithmeticOverflow)?;

//         // Transfer SOL from staker to escrow account (PDA)
//         let cpi_context = CpiContext::new(
//             ctx.accounts.system_program.to_account_info(),
//             system_program::Transfer {
//                 from: ctx.accounts.staker.to_account_info(),
//                 to: ctx.accounts.escrow_account.to_account_info(),
//             },
//         );
//         system_program::transfer(cpi_context, amount)?;

//         emit!(StakeCreated {
//             tenant_profile_id,
//             apartment_id,
//             staker: ctx.accounts.staker.key(),
//             amount,
//         });

//         Ok(())
//     }

//     /// Slash stake (lessor action - tenant broke terms)
//     pub fn slash_stake(
//         ctx: Context<SlashStake>,
//         apartment_hash: [u8; 32],
//         profile_hash: [u8; 32],
//         apartment_id: String,
//         tenant_profile_id: String,
//         apartment_owner: Pubkey,
//     ) -> Result<()> {
//         let escrow_account = &mut ctx.accounts.escrow_account;
//         let stake_record = &mut ctx.accounts.stake_record;

//         // Debug logging - show all current values
//         msg!("=== SLASH STAKE DEBUG ===");
//         msg!("Apartment ID: {}", apartment_id);
//         msg!("Tenant Profile ID: {}", tenant_profile_id);
//         msg!("Apartment Owner: {}", apartment_owner);
//         msg!("Lessor (signer): {}", ctx.accounts.lessor.key());
//         msg!("Stake Record - Amount: {}", stake_record.amount);
//         msg!("Stake Record - Is Active: {}", stake_record.is_active);
//         msg!("Stake Record - Apartment ID: {}", stake_record.apartment_id);
//         msg!("Stake Record - Tenant Profile ID: {}", stake_record.tenant_profile_id);
//         msg!("Stake Record - Staker: {}", stake_record.staker);
//         msg!("Escrow - Total Staked: {}", escrow_account.total_staked);
//         msg!("Escrow - Apartment ID: {}", escrow_account.apartment_id);
//         msg!("Escrow - Lessor: {}", escrow_account.lessor);
//         msg!("Escrow - Is Active: {}", escrow_account.is_active);

//         require!(stake_record.is_active, EscrowError::StakeNotActive);
//         require!(ctx.accounts.lessor.key() == apartment_owner, EscrowError::UnauthorizedLessor);
//         require!(stake_record.apartment_id == apartment_id, EscrowError::InvalidApartment);
//         require!(stake_record.tenant_profile_id == tenant_profile_id, EscrowError::InvalidTenant);

//         let stake_record_amount = stake_record.amount;
//         let escrow_total_staked = escrow_account.total_staked;
//         let staker = stake_record.staker;
        
//         // Use the minimum of what the stake record claims and what's available in escrow
//         let transfer_amount = std::cmp::min(stake_record_amount, escrow_total_staked);
        
//         msg!("Stake record claims: {}", stake_record_amount);
//         msg!("Escrow has available: {}", escrow_total_staked);
//         msg!("Will transfer to penalty wallet: {}", transfer_amount);
        
//         // Check if we have anything to transfer
//         if transfer_amount == 0 {
//             msg!("ERROR: No funds available to transfer!");
//             return Err(EscrowError::InsufficientFunds.into());
//         }

//         stake_record.is_active = false;
        
//         // Update stake record to reflect what was actually transferred
//         stake_record.amount = stake_record_amount
//             .checked_sub(transfer_amount)
//             .ok_or(EscrowError::ArithmeticOverflow)?;

//         // Update total staked in escrow
//         escrow_account.total_staked = escrow_total_staked
//             .checked_sub(transfer_amount)
//             .ok_or(EscrowError::InsufficientFunds)?;

//         msg!("Successfully updated total_staked to: {}", escrow_account.total_staked);
//         msg!("Stake record updated to: {}", stake_record.amount);

//         // Get the hardcoded penalty wallet
//         let penalty_wallet_pubkey = get_penalty_wallet();
//         msg!("Transferring {} to penalty wallet: {}", transfer_amount, penalty_wallet_pubkey);

//         // Transfer SOL directly to penalty wallet
//         **ctx.accounts.escrow_account.to_account_info().try_borrow_mut_lamports()? -= transfer_amount;
//         **ctx.accounts.penalty_wallet.to_account_info().try_borrow_mut_lamports()? += transfer_amount;

//         msg!("Slashed funds transferred to penalty wallet successfully");

//         emit!(StakeSlashed {
//             tenant_profile_id,
//             apartment_id,
//             staker,
//             amount: transfer_amount,
//         });

//         Ok(())
//     }

//     /// Resolve stake (lessor action - tenant fulfilled terms)
//     pub fn resolve_stake(
//         ctx: Context<ResolveStake>,
//         apartment_hash: [u8; 32],
//         profile_hash: [u8; 32],
//         apartment_id: String,
//         tenant_profile_id: String,
//         apartment_owner: Pubkey,
//         referrer_pubkey: Option<Pubkey>,
//         reward_amount: u64,
//     ) -> Result<()> {
//         let escrow_account = &mut ctx.accounts.escrow_account;
//         let stake_record = &mut ctx.accounts.stake_record;

//         // Debug logging - show all current values
//         msg!("=== RESOLVE STAKE DEBUG ===");
//         msg!("Apartment ID: {}", apartment_id);
//         msg!("Tenant Profile ID: {}", tenant_profile_id);
//         msg!("Apartment Owner: {}", apartment_owner);
//         msg!("Lessor (signer): {}", ctx.accounts.lessor.key());
//         msg!("Referrer Pubkey: {:?}", referrer_pubkey);
//         msg!("Reward Amount: {}", reward_amount);
//         msg!("Stake Record - Amount: {}", stake_record.amount);
//         msg!("Stake Record - Is Active: {}", stake_record.is_active);
//         msg!("Stake Record - Apartment ID: {}", stake_record.apartment_id);
//         msg!("Stake Record - Tenant Profile ID: {}", stake_record.tenant_profile_id);
//         msg!("Stake Record - Staker: {}", stake_record.staker);
//         msg!("Escrow - Total Staked: {}", escrow_account.total_staked);
//         msg!("Escrow - Apartment ID: {}", escrow_account.apartment_id);
//         msg!("Escrow - Lessor: {}", escrow_account.lessor);
//         msg!("Escrow - Is Active: {}", escrow_account.is_active);

//         require!(stake_record.is_active, EscrowError::StakeNotActive);
//         require!(ctx.accounts.lessor.key() == apartment_owner, EscrowError::UnauthorizedLessor);
//         require!(stake_record.apartment_id == apartment_id, EscrowError::InvalidApartment);
//         require!(stake_record.tenant_profile_id == tenant_profile_id, EscrowError::InvalidTenant);

//         let stake_record_amount = stake_record.amount;
//         let escrow_total_staked = escrow_account.total_staked;
//         let staker = stake_record.staker;
        
//         // Use the minimum of what the stake record claims and what's available in escrow
//         let total_transfer_amount = std::cmp::min(stake_record_amount, escrow_total_staked);
        
//         msg!("Stake record claims: {}", stake_record_amount);
//         msg!("Escrow has available: {}", escrow_total_staked);
//         msg!("Total transfer amount: {}", total_transfer_amount);
        
//         // Check if we have anything to transfer
//         if total_transfer_amount == 0 {
//             msg!("ERROR: No funds available to transfer!");
//             return Err(EscrowError::InsufficientFunds.into());
//         }

//         // Calculate referrer reward and remaining amount for staker
//         let referrer_reward = if referrer_pubkey.is_some() && reward_amount > 0 {
//             std::cmp::min(reward_amount, total_transfer_amount)
//         } else {
//             0
//         };
        
//         let staker_amount = total_transfer_amount
//             .checked_sub(referrer_reward)
//             .ok_or(EscrowError::ArithmeticOverflow)?;

//         msg!("Referrer reward: {}", referrer_reward);
//         msg!("Staker amount: {}", staker_amount);

//         stake_record.is_active = false;
        
//         // Update stake record to reflect what was actually transferred
//         stake_record.amount = stake_record_amount
//             .checked_sub(total_transfer_amount)
//             .ok_or(EscrowError::ArithmeticOverflow)?;

//         // Update total staked in escrow
//         escrow_account.total_staked = escrow_total_staked
//             .checked_sub(total_transfer_amount)
//             .ok_or(EscrowError::InsufficientFunds)?;

//         msg!("Successfully updated total_staked to: {}", escrow_account.total_staked);
//         msg!("Stake record updated to: {}", stake_record.amount);

//         // Transfer referrer reward if applicable
//         if referrer_reward > 0 && referrer_pubkey.is_some() {
//             let referrer_account = &ctx.accounts.referrer.as_ref()
//                 .ok_or(EscrowError::MissingReferrerAccount)?;
            
//             **ctx.accounts.escrow_account.to_account_info().try_borrow_mut_lamports()? -= referrer_reward;
//             **referrer_account.to_account_info().try_borrow_mut_lamports()? += referrer_reward;
            
//             msg!("Transferred {} to referrer: {}", referrer_reward, referrer_pubkey.unwrap());
//         }

//         // Transfer remaining amount to original staker
//         if staker_amount > 0 {
//             **ctx.accounts.escrow_account.to_account_info().try_borrow_mut_lamports()? -= staker_amount;
//             **ctx.accounts.staker.to_account_info().try_borrow_mut_lamports()? += staker_amount;
            
//             msg!("Transferred {} to staker: {}", staker_amount, staker);
//         }

//         msg!("Transfer completed successfully");

//         emit!(StakeResolved {
//             tenant_profile_id,
//             apartment_id,
//             staker,
//             amount: total_transfer_amount,
//             referrer_reward,
//             referrer: referrer_pubkey,
//         });

//         Ok(())
//     }

//     /// Close escrow (lessor action - when rental period ends)
//     pub fn close_escrow(ctx: Context<CloseEscrow>, apartment_hash: [u8; 32], apartment_id: String) -> Result<()> {
//         let escrow_account = &mut ctx.accounts.escrow_account;

//         require!(escrow_account.is_active, EscrowError::EscrowNotActive);
//         require!(escrow_account.apartment_id == apartment_id, EscrowError::InvalidApartment);
//         require!(ctx.accounts.lessor.key() == escrow_account.lessor, EscrowError::UnauthorizedLessor);

//         // TODO: Check if there are any active stakes before closing
//         escrow_account.is_active = false;

//         emit!(EscrowClosed {
//             apartment_id,
//             lessor: ctx.accounts.lessor.key(),
//         });

//         Ok(())
//     }
// }

// // ============================================================================
// // ACCOUNT CONTEXTS
// // ============================================================================

// #[derive(Accounts)]
// #[instruction(apartment_hash: [u8; 32], apartment_id: String, apartment_owner: Pubkey)]
// pub struct InitializeApartment<'info> {
//     #[account(
//         init,
//         payer = initializer,
//         seeds = [b"escrow", apartment_hash.as_ref()],
//         bump,
//         space = 8 + ApartmentEscrow::INIT_SPACE
//     )]
//     pub escrow_account: Account<'info, ApartmentEscrow>,
    
//     #[account(mut)]
//     pub initializer: Signer<'info>,
    
//     pub system_program: Program<'info, System>,
// }

// #[derive(Accounts)]
// #[instruction(apartment_hash: [u8; 32], amount: u64, profile_hash: [u8; 32], apartment_id: String, tenant_profile_id: String)]
// pub struct StakeForApartment<'info> {
//     #[account(
//         mut,
//         seeds = [b"escrow", apartment_hash.as_ref()],
//         bump = escrow_account.bump
//     )]
//     pub escrow_account: Account<'info, ApartmentEscrow>,

//     #[account(
//         init_if_needed,
//         payer = staker,
//         seeds = [b"stake", apartment_hash.as_ref(), profile_hash.as_ref()],
//         bump,
//         space = 8 + StakeRecord::INIT_SPACE
//     )]
//     pub stake_record: Account<'info, StakeRecord>,
    
//     #[account(mut)]
//     pub staker: Signer<'info>,
    
//     pub system_program: Program<'info, System>,
// }

// #[derive(Accounts)]
// #[instruction(apartment_hash: [u8; 32], profile_hash: [u8; 32], apartment_id: String, tenant_profile_id: String, apartment_owner: Pubkey)]
// pub struct SlashStake<'info> {
//     #[account(
//         mut,
//         seeds = [b"escrow", apartment_hash.as_ref()],
//         bump = escrow_account.bump
//     )]
//     pub escrow_account: Account<'info, ApartmentEscrow>,

//     #[account(
//         mut,
//         seeds = [b"stake", apartment_hash.as_ref(), profile_hash.as_ref()],
//         bump = stake_record.bump
//     )]
//     pub stake_record: Account<'info, StakeRecord>,
    
//     pub lessor: Signer<'info>,
    
//     /// CHECK: This must be the hardcoded penalty wallet
//     #[account(
//         mut,
//         constraint = penalty_wallet.key() == get_penalty_wallet() @ EscrowError::InvalidPenaltyWallet
//     )]
//     pub penalty_wallet: AccountInfo<'info>,
// }

// #[derive(Accounts)]
// #[instruction(apartment_hash: [u8; 32], profile_hash: [u8; 32], apartment_id: String, tenant_profile_id: String, apartment_owner: Pubkey, referrer_pubkey: Option<Pubkey>, reward_amount: u64)]
// pub struct ResolveStake<'info> {
//     #[account(
//         mut,
//         seeds = [b"escrow", apartment_hash.as_ref()],
//         bump = escrow_account.bump
//     )]
//     pub escrow_account: Account<'info, ApartmentEscrow>,

//     #[account(
//         mut,
//         seeds = [b"stake", apartment_hash.as_ref(), profile_hash.as_ref()],
//         bump = stake_record.bump
//     )]
//     pub stake_record: Account<'info, StakeRecord>,
    
//     pub lessor: Signer<'info>,
    
//     /// CHECK: This is the original staker
//     #[account(mut)]
//     pub staker: AccountInfo<'info>,
    
//     /// CHECK: This is the referrer account (optional)
//     #[account(mut)]
//     pub referrer: Option<AccountInfo<'info>>,
// }

// #[derive(Accounts)]
// #[instruction(apartment_hash: [u8; 32], apartment_id: String)]
// pub struct CloseEscrow<'info> {
//     #[account(
//         mut,
//         seeds = [b"escrow", apartment_hash.as_ref()],
//         bump = escrow_account.bump
//     )]
//     pub escrow_account: Account<'info, ApartmentEscrow>,
    
//     pub lessor: Signer<'info>,
// }

// // ============================================================================
// // ACCOUNT STRUCTS
// // ============================================================================

// #[account]
// #[derive(InitSpace)]
// pub struct ApartmentEscrow {
//     #[max_len(50)]
//     pub apartment_id: String,
//     pub lessor: Pubkey,
//     pub total_staked: u64,
//     pub is_active: bool,
//     pub bump: u8,
// }

// #[account]
// #[derive(InitSpace)]
// pub struct StakeRecord {
//     #[max_len(50)]
//     pub tenant_profile_id: String,
//     #[max_len(50)]
//     pub apartment_id: String,
//     pub staker: Pubkey,
//     pub amount: u64,
//     pub is_active: bool,
//     pub bump: u8,
// }

// // ============================================================================
// // EVENTS
// // ============================================================================

// #[event]
// pub struct StakeCreated {
//     pub tenant_profile_id: String,
//     pub apartment_id: String,
//     pub staker: Pubkey,
//     pub amount: u64,
// }

// #[event]
// pub struct StakeSlashed {
//     pub tenant_profile_id: String,
//     pub apartment_id: String,
//     pub staker: Pubkey,
//     pub amount: u64,
// }

// #[event]
// pub struct StakeResolved {
//     pub tenant_profile_id: String,
//     pub apartment_id: String,
//     pub staker: Pubkey,
//     pub amount: u64,
//     pub referrer_reward: u64,
//     pub referrer: Option<Pubkey>,
// }

// #[event]
// pub struct EscrowClosed {
//     pub apartment_id: String,
//     pub lessor: Pubkey,
// }

// #[event]
// pub struct EscrowInitialized {
//     pub apartment_id: String,
//     pub apartment_owner: Pubkey,
// }

// // ============================================================================
// // ERRORS
// // ============================================================================

// #[error_code]
// pub enum EscrowError {
//     #[msg("Invalid amount: must be greater than 0")]
//     InvalidAmount,
//     #[msg("Stake is not active")]
//     StakeNotActive,
//     #[msg("Unauthorized: only the lessor can perform this action")]
//     UnauthorizedLessor,
//     #[msg("Invalid penalty wallet: must match the fixed penalty wallet")]
//     InvalidPenaltyWallet,
//     #[msg("Escrow is not active")]
//     EscrowNotActive,
//     #[msg("Invalid apartment ID")]
//     InvalidApartment,
//     #[msg("Invalid tenant profile ID")]
//     InvalidTenant,
//     #[msg("Escrow still has active stakes, cannot close")]
//     EscrowNotEmpty,
//     #[msg("Escrow not initialized for this apartment")]
//     EscrowNotInitialized,
//     #[msg("Insufficient funds to perform the operation")]
//     InsufficientFunds,
//     #[msg("Arithmetic overflow")]
//     ArithmeticOverflow,
//     #[msg("Unauthorized: only the penalty wallet can perform this action")]
//     UnauthorizedPenaltyWallet,
//     #[msg("Missing referrer account")]
//     MissingReferrerAccount,
// }