// import React, { useState, useEffect, useCallback } from 'react';
// import { SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
// import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
// import { useConnection, useWallet } from '@solana/wallet-adapter-react';
// import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
// import { createHash } from 'crypto';
// import { supabase } from '@/lib/supabase';
// import { useProfile } from '@/contexts/ProfileContext';
// import escrowIdl from '@/lib/escrow-idl.json';
// import { Apartment, Profile } from '@/lib/schema';
// import { getApartmentById } from '@/lib/database';

// // Constants
// const PROGRAM_ID = new PublicKey('4ixiwwbedA1p3s79zgPmqf9C2JKLJ1WkEDVtCw9yQSxf');
// const PENALTY_WALLET = new PublicKey('2c8QGXM2tRMh7yb1Zva48ZmQTPMmLZCu159x2hscxxwv');   // THIS CAN'T CHANGE. IT MUST MATCH THE PENALTY WALLET IN THE CONTRACT.

// // Utility functions
// const hashString = (input: string): Buffer => {
//   return createHash('sha256').update(input).digest();
// };

// const getApartmentEscrowPDA = (apartmentId: string): PublicKey => {
//   const apartmentHash = hashString(apartmentId);
//   const [pda] = PublicKey.findProgramAddressSync(
//     [Buffer.from('escrow'), apartmentHash],
//     PROGRAM_ID
//   );
//   return pda;
// };

// const getStakeRecordPDA = (apartmentId: string, profileId: string): PublicKey => {
//   const apartmentHash = hashString(apartmentId);
//   const profileHash = hashString(profileId);
//   const [pda] = PublicKey.findProgramAddressSync(
//     [Buffer.from('stake'), apartmentHash, profileHash],
//     PROGRAM_ID
//   );
//   return pda;
// };

// interface EscrowOperationsProps {
//   apartmentId: string;
// }

// export const EscrowOperations: React.FC<EscrowOperationsProps> = ({ apartmentId }) => {
//   const { connection } = useConnection();
//   const wallet = useWallet();
//   const { profile } = useProfile();
  
//   const [loading, setLoading] = useState(false);
//   const [initializing, setInitializing] = useState(false);
//   const [dataLoading, setDataLoading] = useState(true);
//   const [apartment, setApartment] = useState<Apartment | null>(null);
//   const [apartmentOwnerProfile, setApartmentOwnerProfile] = useState<Profile | null>(null);
//   const [approvedProfile, setApprovedProfile] = useState<Profile | null>(null);
//   const [escrowData, setEscrowData] = useState<any>(null);
//   const [stakeRecords, setStakeRecords] = useState<any[]>([]);
//   const [stakeAmount, setStakeAmount] = useState('');
//   const [hasAccess, setHasAccess] = useState<boolean | null>(null);
//   const [referrerPubkey, setReferrerPubkey] = useState<string | null>(null);


//   // Get program instance
//   const getProgram = useCallback(() => {
//     if (!wallet.publicKey || !wallet.signTransaction) return null;
    
//     const provider = new AnchorProvider(
//       connection,
//       wallet as any,
//       { commitment: 'confirmed' }
//     );
    
//     return new Program(escrowIdl as any, provider);
//   }, [connection, wallet]);

//   // Helper function to check if current profile has access
//   const checkAccess = useCallback((): boolean => {
//     if (!profile?.id || !wallet.publicKey) return false;
    
//     // Check if user is the apartment owner
//     const isOwner = apartment?.owner === profile.id;
    
//     // Check if user is the approved profile
//     const isApproved = apartment?.approved_profile === profile.id;
    
//     // console.log('=== ACCESS CONTROL DEBUG ===');
//     // console.log('User Profile ID:', profile.id);
//     // console.log('Apartment Owner:', apartment?.owner);
//     // console.log('Apartment Approved Profile:', apartment?.approved_profile);
//     // console.log('Is Owner:', isOwner);
//     // console.log('Is Approved:', isApproved);
//     // console.log('Final Access:', isOwner || isApproved);

//     return isOwner || isApproved;
//   }, [profile, apartment, wallet.publicKey]);

//   // Fetch all data
//   const fetchData = useCallback(async () => {
//     if (!apartmentId) return;

//     setDataLoading(true);
//     try {
//       // Fetch apartment data using our database helper (this transforms the data properly)
//       const apartmentData = await getApartmentById(apartmentId);
      
//       if (!apartmentData) {
//         console.error('Apartment not found');
//         setDataLoading(false);
//         return;
//       }

//       setApartment(apartmentData);

//       console.log("apartmentData", apartmentData)

//       if (!apartmentData?.approved_profile) {
//         console.log("apartment", apartmentData)
//         console.log("TOTALLY STUPID ERROR PLEASE FIX")
//         return "NO APPROVED PROFILE";
//       }
  
//       if (!apartmentData?.referrers_pubkeys) {
//         return "NO REFERERS FOR THIS APARTMENT";
//       }
  
//       // console.log("=== REFERRER PUBKEY DEBUG ===");
//       // console.log("apartment.referrers_pubkeys type:", typeof apartment.referrers_pubkeys);
//       // console.log("apartment.referrers_pubkeys:", apartment.referrers_pubkeys);
//       // console.log("apartment.referrers_pubkeys instanceof Map:", apartment.referrers_pubkeys instanceof Map);
//       // console.log("apartment.approved_profile:", apartment.approved_profile);
  
//       let referrerPubkey: string | undefined;
  
//       // Handle both Map and plain object formats
//       if (apartmentData.referrers_pubkeys instanceof Map) {
//         referrerPubkey = apartmentData.referrers_pubkeys.get(apartmentData.approved_profile);
//       } else if (typeof apartmentData.referrers_pubkeys === 'object') {
//         // Handle as plain object (in case serialization converted Map to object)
//         referrerPubkey = (apartmentData.referrers_pubkeys as any)[apartmentData.approved_profile];
//       }
  
//       if (!referrerPubkey) {
//         return "NO REFERER FOR THIS USER";
//       }

//       setReferrerPubkey(referrerPubkey);

      

//       // Fetch apartment owner's profile to get their public key
//       if (apartmentData?.owner) {
//         const { data: ownerProfile } = await supabase
//           .from('profiles')
//           .select('*')
//           .eq('id', apartmentData.owner)
//           .single();
        
//         setApartmentOwnerProfile(ownerProfile);
//       }

//       // Fetch approved profile if exists
//       if (apartmentData?.approved_profile) {
//         const { data: approvedProfileData } = await supabase
//           .from('profiles')
//           .select('*')
//           .eq('id', apartmentData.approved_profile)
//           .single();
        
//         setApprovedProfile(approvedProfileData);
//       } else {
//         setApprovedProfile(null);
//       }

//       const program = getProgram();
//       if (!program) {
//         setDataLoading(false);
//         return;
//       }

//       // Fetch escrow data
//       let escrowAccount = null;
//       try {
//         const escrowPDA = getApartmentEscrowPDA(apartmentId);
//         escrowAccount = await (program.account as any).apartmentEscrow.fetch(escrowPDA);
//         setEscrowData(escrowAccount);
//       } catch (error) {
//         console.log('No escrow found');
//         setEscrowData(null);
//       }

//       // Fetch stake records
//       try {
//         const accounts = await (program.account as any).stakeRecord.all();
//         const filteredAccounts = accounts.filter((account: any) => 
//           account.account.apartmentId === apartmentId
//         );
//         setStakeRecords(filteredAccounts);
//       } catch (error) {
//         console.error('Error fetching stakes:', error);
//         setStakeRecords([]);
//       }

//     } catch (error) {
//       console.error('Error fetching data:', error);
//     } finally {
//       setDataLoading(false);
//     }
//   }, [apartmentId, getProgram]);

//   // Update access control when data changes
//   useEffect(() => {
//     if (apartment && profile && wallet.publicKey) {
//       setHasAccess(checkAccess());
//     } else {
//       setHasAccess(false);
//     }
//   }, [apartment, profile, wallet.publicKey, checkAccess]);

//   useEffect(() => {
//     fetchData();
//   }, [fetchData]);

//   // Initialize apartment
//   const handleInitialize = async () => {
//     if (!apartmentOwnerProfile?.pubkey) {
//       console.log('Apartment owner public key not found');
//       return;
//     }

//     // Debug the pubkey value
//     console.log('Owner profile:', apartmentOwnerProfile);
//     console.log('Raw pubkey:', apartmentOwnerProfile.pubkey);
//     console.log('Pubkey type:', typeof apartmentOwnerProfile.pubkey);
//     console.log('Pubkey length:', apartmentOwnerProfile.pubkey?.length);

//     // Validate pubkey format
//     if (!apartmentOwnerProfile.pubkey || typeof apartmentOwnerProfile.pubkey !== 'string') {
//       console.log('Invalid pubkey format - not a string');
//       return;
//     }

//     if (apartmentOwnerProfile.pubkey.length !== 44) {
//       console.log('Invalid pubkey length - should be 44 characters for base58');
//       return;
//     }

//     const program = getProgram();
//     if (!program || !wallet.publicKey) {
//       console.log('Wallet not connected');
//       return;
//     }

//     setInitializing(true);
//     try {
//       const apartmentHash = Array.from(hashString(apartmentId));
//       console.log(apartmentHash);

//       // Try to create PublicKey with validation
//       let apartmentOwner: PublicKey;
//       try {
//         apartmentOwner = new PublicKey(apartmentOwnerProfile.pubkey);
//         console.log('PublicKey created successfully:', apartmentOwner.toString());
//       } catch (pkError) {
//         console.error('Failed to create PublicKey:', pkError);
//         console.log('Invalid base58 string:', apartmentOwnerProfile.pubkey);
//         return;
//       }

//       const escrowPDA = getApartmentEscrowPDA(apartmentId);

//       const tx = await program.methods
//         .initializeApartment(apartmentHash, apartmentId, apartmentOwner)
//         .accounts({
//           escrowAccount: escrowPDA,
//           initializer: wallet.publicKey,
//           systemProgram: SystemProgram.programId,
//         })
//         .rpc();

//       console.log('Initialize tx:', tx);
//       console.log('Apartment initialized successfully!');
//       fetchData();
//     } catch (error) {
//       console.error('Error:', error);
//       console.log('Error: ' + error);
//     } finally {
//       setInitializing(false);
//     }
//   };

//   // Create stake
//   const handleStake = async () => {
//     if (!profile?.id || !stakeAmount) {
//       console.log('Missing profile or stake amount');
//       return;
//     }

//     const program = getProgram();
//     if (!program || !wallet.publicKey) {
//       console.log('Wallet not connected');
//       return;
//     }

//     setLoading(true);
//     try {
//       const amount = new BN(parseFloat(stakeAmount) * LAMPORTS_PER_SOL);
//       const apartmentHash = Array.from(hashString(apartmentId));
//       const profileHash = Array.from(hashString(profile.id));
      
//       const escrowPDA = getApartmentEscrowPDA(apartmentId);
//       const stakeRecordPDA = getStakeRecordPDA(apartmentId, profile.id);

//       const tx = await program.methods
//         .stakeForApartment(apartmentHash, amount, profileHash, apartmentId, profile.id)
//         .accounts({
//           escrowAccount: escrowPDA,
//           stakeRecord: stakeRecordPDA,
//           staker: wallet.publicKey,
//           systemProgram: SystemProgram.programId,
//         })
//         .rpc();

//       console.log('Stake tx:', tx);
//       console.log('Stake created successfully!');
//       setStakeAmount('');
//       fetchData();
//     } catch (error) {
//       console.error('Error:', error);
//       console.log('Error: ' + error);
//     } finally {
//       setLoading(false);
//     }
//   };

//   // Resolve stake
//   const handleResolve = async (stakeRecord: any) => {
//     if (!apartmentOwnerProfile?.pubkey) {
//       console.log('Apartment owner public key not found');
//       return;
//     }

//     // Validate pubkey format
//     if (!apartmentOwnerProfile.pubkey || typeof apartmentOwnerProfile.pubkey !== 'string' || apartmentOwnerProfile.pubkey.length !== 44) {
//       console.log('Invalid apartment owner pubkey format');
//       return;
//     }

//     const program = getProgram();
//     if (!program || !wallet.publicKey) {
//       console.log('Wallet not connected');
//       return;
//     }

//     setLoading(true);
//     try {
//       const apartmentHash = Array.from(hashString(apartmentId));
//       const profileHash = Array.from(hashString(stakeRecord.account.tenantProfileId));
      
//       let apartmentOwner: PublicKey;
//       try {
//         apartmentOwner = new PublicKey(apartmentOwnerProfile.pubkey);
//       } catch (pkError) {
//         console.error('Failed to create apartment owner PublicKey:', pkError);
//         return;
//       }

//       // Prepare referrer parameters
//       let referrerPublicKey: PublicKey | null = null;
//       const rewardAmount = new BN((apartment?.reward || 0) * LAMPORTS_PER_SOL);
      
//       // Get referrer public key if available
//       if (referrerPubkey && apartment?.approved_profile) {
//         try {
//           referrerPublicKey = new PublicKey(referrerPubkey);
//           console.log('Referrer pubkey:', referrerPublicKey.toString());
//           console.log('Reward amount (SOL):', apartment.reward);
//           console.log('Reward amount (lamports):', rewardAmount.toString());
//         } catch (error) {
//           console.error('Invalid referrer pubkey:', error);
//           referrerPublicKey = null;
//         }
//       }
      
//       const escrowPDA = getApartmentEscrowPDA(apartmentId);
//       const stakeRecordPDA = getStakeRecordPDA(apartmentId, stakeRecord.account.tenantProfileId);

//       // Build accounts object
//       const accounts: any = {
//         escrowAccount: escrowPDA,
//         stakeRecord: stakeRecordPDA,
//         lessor: wallet.publicKey,
//         staker: stakeRecord.account.staker,
//       };

//       // Add referrer account if available
//       if (referrerPublicKey) {
//         accounts.referrer = referrerPublicKey;
//       }

//       const tx = await program.methods
//         .resolveStake(
//           apartmentHash, 
//           profileHash, 
//           apartmentId, 
//           stakeRecord.account.tenantProfileId, 
//           apartmentOwner,
//           referrerPublicKey, // Optional<Pubkey>
//           rewardAmount       // u64 reward amount in lamports
//         )
//         .accounts(accounts)
//         .rpc();

//       console.log('Resolve tx:', tx);
//       console.log('Stake resolved successfully!');
//       fetchData();
//     } catch (error) {
//       console.error('Error:', error);
//       console.log('Error: ' + error);
//     } finally {
//       setLoading(false);
//     }
//   };

//   // Slash stake
//   const handleSlash = async (stakeRecord: any) => {
//     if (!apartmentOwnerProfile?.pubkey) {
//       console.log('Apartment owner public key not found');
//       return;
//     }

//     // Validate pubkey format
//     if (!apartmentOwnerProfile.pubkey || typeof apartmentOwnerProfile.pubkey !== 'string' || apartmentOwnerProfile.pubkey.length !== 44) {
//       console.log('Invalid apartment owner pubkey format');
//       return;
//     }

//     const program = getProgram();
//     if (!program || !wallet.publicKey) {
//       console.log('Wallet not connected');
//       return;
//     }

//     setLoading(true);
//     try {
//       const apartmentHash = Array.from(hashString(apartmentId));
//       const profileHash = Array.from(hashString(stakeRecord.account.tenantProfileId));
      
//       let apartmentOwner: PublicKey;
//       try {
//         apartmentOwner = new PublicKey(apartmentOwnerProfile.pubkey);
//       } catch (pkError) {
//         console.error('Failed to create apartment owner PublicKey:', pkError);
//         return;
//       }
      
//       const escrowPDA = getApartmentEscrowPDA(apartmentId);
//       const stakeRecordPDA = getStakeRecordPDA(apartmentId, stakeRecord.account.tenantProfileId);

//       const tx = await program.methods
//         .slashStake(apartmentHash, profileHash, apartmentId, stakeRecord.account.tenantProfileId, apartmentOwner)
//         .accounts({
//           escrowAccount: escrowPDA,
//           stakeRecord: stakeRecordPDA,
//           lessor: wallet.publicKey,
//           penaltyWallet: PENALTY_WALLET,
//         })
//         .rpc();

//       console.log('Slash tx:', tx);
//       console.log('Stake slashed successfully!');
//       fetchData();
//     } catch (error) {
//       console.error('Error:', error);
//       console.log('Error: ' + error);
//     } finally {
//       setLoading(false);
//     }
//   };


//   // const getReferrerPubkey = () => {
//   //   if (!apartment?.approved_profile) {
//   //     console.log("apartment", apartment)
//   //     console.log("TOTALLY STUPID ERROR PLEASE FIX")
//   //     return "NO APPROVED PROFILE";
//   //   }

//   //   if (!apartment?.referrers_pubkeys) {
//   //     return "NO REFERERS FOR THIS APARTMENT";
//   //   }

//   //   // console.log("=== REFERRER PUBKEY DEBUG ===");
//   //   // console.log("apartment.referrers_pubkeys type:", typeof apartment.referrers_pubkeys);
//   //   // console.log("apartment.referrers_pubkeys:", apartment.referrers_pubkeys);
//   //   // console.log("apartment.referrers_pubkeys instanceof Map:", apartment.referrers_pubkeys instanceof Map);
//   //   // console.log("apartment.approved_profile:", apartment.approved_profile);

//   //   let referrerPubkey: string | undefined;

//   //   // Handle both Map and plain object formats
//   //   if (apartment.referrers_pubkeys instanceof Map) {
//   //     referrerPubkey = apartment.referrers_pubkeys.get(apartment.approved_profile);
//   //   } else if (typeof apartment.referrers_pubkeys === 'object') {
//   //     // Handle as plain object (in case serialization converted Map to object)
//   //     referrerPubkey = (apartment.referrers_pubkeys as any)[apartment.approved_profile];
//   //   }

//   //   if (!referrerPubkey) {
//   //     return "NO REFERER FOR THIS USER";
//   //   }

//   //   return referrerPubkey;
//   // };


//   // Check if current user is the apartment owner
//   const isOwner = profile &&
//                   apartmentOwnerProfile &&
//                   apartmentOwnerProfile.pubkey === wallet.publicKey?.toString() &&
//                   apartment?.owner === profile?.id;


//   if (!wallet.connected) {
//     return (
//       <div className="min-h-screen bg-gray-50 flex items-center justify-center">
//         <div className="text-center">
//           <h1 className="text-3xl font-bold mb-8">Connect Wallet</h1>
//           <WalletMultiButton />
//         </div>
//       </div>
//     );
//   }

//   // Show loading while fetching initial data
//   if (dataLoading) {
//     return (
//       <div className="min-h-screen bg-gray-50 flex items-center justify-center">
//         <div className="text-center">
//           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
//           <h1 className="text-2xl font-semibold mb-2">Loading Apartment Data...</h1>
//           <p className="text-gray-600">Please wait while we fetch the apartment information</p>
//         </div>
//       </div>
//     );
//   }

//   // Show "No Access" page if user doesn't have permission
//   if (hasAccess === false) {
//     return (
//       <div className="min-h-screen bg-gray-50 flex items-center justify-center">
//         <div className="text-center max-w-md mx-auto">
//           <div className="bg-red-100 border border-red-400 rounded-lg p-6 mb-6">
//             <div className="text-red-600 mb-4">
//               <svg className="h-12 w-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
//               </svg>
//             </div>
//             <h1 className="text-2xl font-bold text-red-800 mb-2">Access Denied</h1>
//             <p className="text-red-700 mb-4">
//               You don't have permission to access this apartment's escrow system.
//             </p>
//             {apartment && (
//               <div className="text-sm text-red-600 mb-4">
//                 <p><strong>Apartment:</strong> {apartment.location}</p>
//                 <p><strong>Rent:</strong> ${apartment.rent}/month</p>
//                 <p><strong>Owner:</strong> {apartmentOwnerProfile?.username || 'Unknown'}</p>
//                 {apartment.approved_profile && (
//                   <p><strong>Approved Tenant:</strong> {approvedProfile?.username || apartment.approved_profile}</p>
//                 )}
//               </div>
//             )}
//             <div className="text-xs text-red-500 mb-4">
//               <p>Only the apartment owner or approved tenant can access this escrow.</p>
//               <p>Your profile: {profile?.username} ({profile?.id?.slice(0, 8)}...)</p>
//             </div>
//           </div>
//           <div className="flex gap-4 justify-center">
//             <WalletMultiButton />
//             <button
//               onClick={fetchData}
//               className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
//             >
//               Refresh
//             </button>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   // Show different states based on escrow initialization and ownership
//   if (!escrowData) {
//     // Escrow not initialized
//     if (isOwner) {
//       // Owner needs to initialize
//       return (
//         <div className="min-h-screen bg-gray-50 flex items-center justify-center">
//           <div className="text-center max-w-md mx-auto">
//             {initializing ? (
//               <>
//                 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-600 mx-auto mb-4"></div>
//                 <h1 className="text-2xl font-semibold mb-2">Initializing Escrow...</h1>
//                 <p className="text-gray-600">Setting up the escrow system for this apartment</p>
//               </>
//             ) : (
//               <>
//                 <div className="bg-yellow-100 border border-yellow-400 rounded-lg p-6 mb-6">
//                   <h1 className="text-2xl font-bold text-yellow-800 mb-2">Escrow Not Initialized</h1>
//                   <p className="text-yellow-700 mb-4">
//                     As the apartment owner, you need to initialize the escrow system before tenants can stake.
//                   </p>
//                   {apartment && (
//                     <div className="text-sm text-yellow-600 mb-4">
//                       <p><strong>Apartment:</strong> {apartment.location}</p>
//                       <p><strong>Rent:</strong> ${apartment.rent}/month</p>
//                     </div>
//                   )}
//                   <button
//                     onClick={handleInitialize}
//                     disabled={!apartmentOwnerProfile?.pubkey}
//                     className="px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
//                   >
//                     Initialize Escrow System
//                   </button>
//                   {!apartmentOwnerProfile?.pubkey && (
//                     <p className="text-xs text-red-600 mt-2">
//                       No public key found in your profile. Please update your profile.
//                     </p>
//                   )}
//                 </div>
//                 <div className="flex gap-4 justify-center">
//                   <WalletMultiButton />
//                   <button
//                     onClick={fetchData}
//                     className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
//                   >
//                     Refresh
//                   </button>
//                 </div>
//               </>
//             )}
//           </div>
//         </div>
//       );
//     } else {
//       // Non-owner waiting for initialization
//       return (
//         <div className="min-h-screen bg-gray-50 flex items-center justify-center">
//           <div className="text-center max-w-md mx-auto">
//             <div className="bg-blue-100 border border-blue-400 rounded-lg p-6 mb-6">
//               <div className="animate-pulse">
//                 <div className="h-8 w-8 bg-blue-600 rounded-full mx-auto mb-4"></div>
//               </div>
//               <h1 className="text-2xl font-bold text-blue-800 mb-2">Waiting for Initialization</h1>
//               <p className="text-blue-700 mb-4">
//                 The escrow system for this apartment hasn't been set up yet. Please wait for the apartment owner to initialize it.
//               </p>
//               {apartment && (
//                 <div className="text-sm text-blue-600 mb-4">
//                   <p><strong>Apartment:</strong> {apartment.location}</p>
//                   <p><strong>Rent:</strong> ${apartment.rent}/month</p>
//                   <p><strong>Owner:</strong> {apartmentOwnerProfile?.username || 'Unknown'}</p>
//                 </div>
//               )}
//             </div>
//             <div className="flex gap-4 justify-center">
//               <WalletMultiButton />
//               <button
//                 onClick={fetchData}
//                 className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
//               >
//                 Check Again
//               </button>
//             </div>
//           </div>
//         </div>
//       );
//     }
//   }

//   return (
//     <div className="min-h-screen bg-gray-50 p-8">
//       <div className="max-w-4xl mx-auto">
//         {/* Header */}
//         <div className="flex justify-between items-center mb-8">
//           <div>
//             <h1 className="text-3xl font-bold">Apartment Escrow</h1>
//             <p className="text-gray-600">Apartment: {apartmentId}</p>
//             {apartment && (
//               <p className="text-sm text-gray-500">
//                 {apartment.location} • ${apartment.rent}/month
//               </p>
//             )}
//             {referrerPubkey && (
//               <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
//                 <p className="text-sm text-green-700">
//                   <strong>Referred by:</strong> {referrerPubkey}
//                 </p>
//               </div>
//             )}
//           </div>
//           <div className="flex gap-4">
//             <WalletMultiButton />
//             <button
//               onClick={fetchData}
//               className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
//             >
//               Refresh
//             </button>
//           </div>
//         </div>

//         {/* Access Status */}
//         <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
//           <h3 className="text-blue-700 font-medium mb-2">🔍 Access Status</h3>
//           <div className="text-sm space-y-1">
//             <p><strong>Your Profile:</strong> <span className="font-mono text-blue-800">{profile?.username} ({profile?.id?.slice(0, 8)}...)</span></p>
//             <p><strong>Is Owner:</strong> <span className={isOwner ? "text-green-600" : "text-red-600"}>{isOwner ? "Yes" : "No"}</span></p>
//             <p><strong>Approved Tenant:</strong> {apartment?.approved_profile ? (
//               <span className={apartment.approved_profile === profile?.id ? "text-green-600" : "text-gray-600"}>
//                 {approvedProfile?.username || apartment.approved_profile} {apartment.approved_profile === profile?.id && "(You)"}
//               </span>
//             ) : (
//               <span className="text-gray-400">None</span>
//             )}</p>
//             <p>
//               <strong>Referer: </strong> 
//               <span> 
//                 {referrerPubkey}
//               </span>
//             </p>

//           </div>
//         </div>

//         {/* Escrow Status */}
//         {escrowData && (
//           <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
//             <h3 className="text-green-700 font-medium mb-2">✅ Escrow Active</h3>
//             <div className="grid grid-cols-2 gap-4 text-sm">
//               <p><strong>Total Staked:</strong> {escrowData.totalStaked ? (escrowData.totalStaked.toNumber() / LAMPORTS_PER_SOL).toFixed(4) : '0'} SOL</p>
//               <p><strong>Owner:</strong> {escrowData.lessor?.toString().slice(0, 8)}...</p>
//               <p><strong>Active Stakes:</strong> {stakeRecords.length}</p>
//               <p><strong>Status:</strong> {escrowData.isActive ? 'Active' : 'Inactive'}</p>
//             </div>
//           </div>
//         )}

//         {/* Operations Grid */}
//         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//           {/* Staking */}
//           {escrowData && (
//             <div className="bg-white rounded-lg shadow p-6">
//               <h3 className="text-lg font-semibold mb-4">Create Stake</h3>
//               <div className="space-y-4">
//                 <div className="flex gap-2">
//                   <input
//                     type="number"
//                     value={stakeAmount}
//                     onChange={(e) => setStakeAmount(e.target.value)}
//                     placeholder="Amount in SOL"
//                     className="flex-1 px-3 py-2 border rounded-lg"
//                     step="0.001"
//                     min="0"
//                   />
//                   <button
//                     onClick={handleStake}
//                     disabled={loading || !stakeAmount || !profile?.id}
//                     className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
//                   >
//                     {loading ? 'Staking...' : 'Stake'}
//                   </button>
//                 </div>
//                 <p className="text-xs text-gray-500">
//                   Profile: {profile?.username} ({profile?.id?.slice(0, 8)}...)
//                 </p>
//               </div>
//             </div>
//           )}

//           {/* Stakes List */}
//           <div className="bg-white rounded-lg shadow p-6">
//             <h3 className="text-lg font-semibold mb-4">Active Stakes</h3>
//             {stakeRecords.length === 0 ? (
//               <p className="text-gray-500">No stakes found</p>
//             ) : (
//               <div className="space-y-3">
//                 {stakeRecords.map((record, index) => (
//                   <div key={index} className="border rounded-lg p-3">
//                     <div className="flex justify-between items-start">
//                       <div className="flex-1">
//                         <p className="font-medium text-sm">Profile: {record.account.tenantProfileId}</p>
//                         <p className="text-sm text-gray-600">
//                           Amount: {(record.account.amount.toNumber() / LAMPORTS_PER_SOL).toFixed(4)} SOL
//                         </p>
//                         <p className="text-xs text-gray-500">
//                           Staker: {record.account.staker.toString().slice(0, 8)}...
//                         </p>
//                       </div>
//                       {isOwner && record.account.isActive && (
//                         <div className="flex gap-1">
//                           <button
//                             onClick={() => handleResolve(record)}
//                             disabled={loading}
//                             className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
//                           >
//                             Resolve
//                           </button>
//                           <button
//                             onClick={() => handleSlash(record)}
//                             disabled={loading}
//                             className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
//                           >
//                             Slash
//                           </button>
//                         </div>
//                       )}
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>
//         </div>

//         {/* Instructions */}
//         <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
//           <h3 className="font-semibold text-blue-900 mb-2">How it works:</h3>
//           <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
//             <li><strong>Initialize:</strong> Apartment owner sets up escrow with their public key</li>
//             <li><strong>Access Control:</strong> Only owner or approved tenant (from database) can access</li>
//             <li><strong>Stake:</strong> Approved users can deposit SOL mapped to their profile ID</li>
//             <li><strong>Resolve/Slash:</strong> Only apartment owner can return money or send to penalty wallet</li>
//           </ol>
//           {apartmentOwnerProfile && (
//             <div className="mt-3 p-3 bg-yellow-100 rounded text-sm text-yellow-800">
//               <strong>Owner:</strong> {apartmentOwnerProfile.username || 'Unknown'}
//               <br />
//               <strong>Owner Wallet:</strong> {apartmentOwnerProfile.pubkey?.slice(0, 8)}...{apartmentOwnerProfile.pubkey?.slice(-8)}
//               {isOwner && <span className="ml-2 text-green-700">(You are the owner)</span>}
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }; 




// import { PublicKey, Connection, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
// import { WalletContextState } from '@solana/wallet-adapter-react';
// import { createSolanaClient, address, Address } from 'gill';
// import BN from 'bn.js';
// import { LAMPORTS_PER_SOL } from '@solana/web3.js';

// import { hashString } from '../utils/crypto';
// import { getApartmentEscrowPDA, getStakeRecordPDA } from '../utils/pda';
// import { 
//   InitializeApartmentSchema, 
//   StakeForApartmentSchema, 
//   ResolveStakeSchema, 
//   SlashStakeSchema,
//   StakeRecordSchema 
// } from '../utils/schemas';

// const PROGRAM_ID = new PublicKey('4ixiwwbedA1p3s79zgPmqf9C2JKLJ1WkEDVtCw9yQSxf');
// const PENALTY_WALLET = address('2c8QGXM2tRMh7yb1Zva48ZmQTPMmLZCu159x2hscxxwv');

// // Create Solana client
// const solanaClient = createSolanaClient({ urlOrMoniker: 'devnet' });
// const { rpc } = solanaClient;

// // Initialize apartment escrow
// export const initializeApartment = async (
//   apartmentId: string,
//   apartmentOwnerPubkey: string,
//   wallet: WalletContextState
// ): Promise<string> => {
//   if (!wallet.publicKey || !wallet.sendTransaction) {
//     throw new Error('Wallet not connected');
//   }

//   const apartmentHash = Array.from(hashString(apartmentId));
//   const apartmentOwner = address(apartmentOwnerPubkey);
//   const escrowPDA = getApartmentEscrowPDA(apartmentId);

//   // Get latest blockhash
//   const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

//   // Create instruction data
//   const buffer = Buffer.alloc(1000);
//   InitializeApartmentSchema.encode({
//     apartment_hash: apartmentHash,
//     apartment_id: apartmentId,
//     apartment_owner: new PublicKey(apartmentOwner)
//   }, buffer);

//   const encodedSize = InitializeApartmentSchema.getSpan(buffer);
//   const instructionData = buffer.subarray(0, encodedSize);

//   // Create instruction
//   const instruction = new TransactionInstruction({
//     keys: [
//       { pubkey: new PublicKey(escrowPDA), isSigner: false, isWritable: true },
//       { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
//       { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
//     ],
//     data: Buffer.concat([
//       Buffer.from([163, 134, 140, 192, 15, 6, 227, 23]), // initialize_apartment discriminator
//       instructionData
//     ]),
//     programId: PROGRAM_ID,
//   });

//   // Create and send transaction
//   const transaction = new Transaction();
//   transaction.add(instruction);
//   transaction.recentBlockhash = latestBlockhash.blockhash;
//   transaction.feePayer = wallet.publicKey;

//   const connection = new Connection('https://api.devnet.solana.com');
//   const signature = await wallet.sendTransaction(transaction, connection);
  
//   return signature;
// };

// // Stake SOL for apartment
// export const stakeForApartment = async (
//   apartmentId: string,
//   amount: number,
//   profileId: string,
//   wallet: WalletContextState
// ): Promise<string> => {
//   if (!wallet.publicKey || !wallet.sendTransaction) {
//     throw new Error('Wallet not connected');
//   }

//   const amountLamports = amount * LAMPORTS_PER_SOL;
//   const escrowPDA = getApartmentEscrowPDA(apartmentId);
//   const stakeRecordPDA = getStakeRecordPDA(apartmentId, profileId);

//   const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

//   // Create instruction data
//   const buffer = Buffer.alloc(1000);
//   StakeForApartmentSchema.encode({
//     apartment_hash: Array.from(hashString(apartmentId)),
//     amount: new BN(amountLamports),
//     profile_hash: Array.from(hashString(profileId)),
//     apartment_id: apartmentId,
//     tenant_profile_id: profileId
//   }, buffer);

//   const encodedSize = StakeForApartmentSchema.getSpan(buffer);
//   const instructionData = buffer.subarray(0, encodedSize);

//   // Create instruction
//   const instruction = new TransactionInstruction({
//     keys: [
//       { pubkey: new PublicKey(escrowPDA), isSigner: false, isWritable: true },
//       { pubkey: new PublicKey(stakeRecordPDA), isSigner: false, isWritable: true },
//       { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
//       { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
//     ],
//     data: Buffer.concat([
//       Buffer.from([254, 32, 189, 253, 3, 2, 123, 132]), // stake_for_apartment discriminator
//       instructionData
//     ]),
//     programId: PROGRAM_ID,
//   });

//   // Create and send transaction
//   const transaction = new Transaction();
//   transaction.add(instruction);
//   transaction.recentBlockhash = latestBlockhash.blockhash;
//   transaction.feePayer = wallet.publicKey;

//   const connection = new Connection('https://api.devnet.solana.com');
//   const signature = await wallet.sendTransaction(transaction, connection);
  
//   return signature;
// };

// // Resolve stake (return money to tenant)
// export const resolveStake = async (
//   apartmentId: string,
//   stakeRecord: any,
//   apartmentOwnerPubkey: string,
//   referrerPubkey: string | null,
//   rewardAmount: number,
//   wallet: WalletContextState
// ): Promise<string> => {
//   if (!wallet.publicKey || !wallet.sendTransaction) {
//     throw new Error('Wallet not connected');
//   }

//   console.log('=== RESOLVE STAKE DEBUG ===');
//   console.log('apartmentId:', apartmentId);
//   console.log('stakeRecord:', stakeRecord);
//   console.log('apartmentOwnerPubkey:', apartmentOwnerPubkey);
//   console.log('referrerPubkey:', referrerPubkey);
//   console.log('rewardAmount:', rewardAmount);
//   console.log('wallet.publicKey:', wallet.publicKey.toBase58());
//   console.log('Connected wallet === apartment owner?', wallet.publicKey.toBase58() === apartmentOwnerPubkey);

//   const tenantProfileId = stakeRecord.tenant_profile_id;
//   const apartmentHash = Array.from(hashString(apartmentId));
//   const profileHash = Array.from(hashString(tenantProfileId));
  
//   const apartmentOwner = new PublicKey(apartmentOwnerPubkey);
//   const escrowPDA = getApartmentEscrowPDA(apartmentId);
//   const stakeRecordPDA = getStakeRecordPDA(apartmentId, tenantProfileId);

//   console.log('PDAs:');
//   console.log('escrowPDA:', escrowPDA);
//   console.log('stakeRecordPDA:', stakeRecordPDA);
//   console.log('stakeRecord.staker:', stakeRecord.staker);

//   let referrerPublicKey: PublicKey | null = null;
//   if (referrerPubkey) {
//     referrerPublicKey = new PublicKey(referrerPubkey);
//   }

//   console.log('Referrer logic:');
//   console.log('Has referrerPubkey?', !!referrerPubkey);
//   console.log('Final referrer will be:', (referrerPublicKey || apartmentOwner).toBase58());
//   console.log('apartmentOwner pubkey:', apartmentOwner.toBase58());

//   // Create instruction data
//   const buffer = Buffer.alloc(1000);
//   const instructionData = {
//     apartmentHash,
//     profileHash,
//     apartmentId,
//     tenantProfileId,
//     apartmentOwner,
//     referrerPubkey: referrerPublicKey,
//     rewardAmount: new BN(rewardAmount * LAMPORTS_PER_SOL),
//   };
  
//   console.log('Instruction data:', instructionData);
  
//   ResolveStakeSchema.encode(instructionData, buffer);

//   const encodedSize = ResolveStakeSchema.getSpan(buffer);
//   const instructionDataBuffer = buffer.subarray(0, encodedSize);

//   // Create accounts array - always include all accounts in IDL order
//   const accounts = [
//     { pubkey: new PublicKey(escrowPDA), isSigner: false, isWritable: true },
//     { pubkey: new PublicKey(stakeRecordPDA), isSigner: false, isWritable: true },
//     { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
//     { pubkey: new PublicKey(stakeRecord.staker), isSigner: false, isWritable: true },
//     { 
//       pubkey: referrerPublicKey || apartmentOwner, // Use apartment owner as referrer if no actual referrer
//       isSigner: false, 
//       isWritable: true 
//     },
//   ];

//   console.log('Accounts:', accounts.map(acc => ({
//     pubkey: acc.pubkey.toBase58(),
//     isSigner: acc.isSigner,
//     isWritable: acc.isWritable
//   })));

//   // Create instruction
//   const instruction = new TransactionInstruction({
//     keys: accounts,
//     programId: PROGRAM_ID,
//     data: Buffer.concat([
//       Buffer.from([162, 136, 9, 179, 86, 213, 52, 160]), // resolve_stake discriminator
//       instructionDataBuffer
//     ]),
//   });

//   console.log('Instruction created:', {
//     programId: instruction.programId.toBase58(),
//     dataLength: instruction.data.length,
//     keysLength: instruction.keys.length
//   });

//   // Create and send transaction
//   const transaction = new Transaction().add(instruction);
//   const connection = new Connection('https://api.devnet.solana.com');
  
//   console.log('Sending transaction...');
//   const signature = await wallet.sendTransaction(transaction, connection);
//   console.log('Transaction sent, confirming...');
//   await connection.confirmTransaction(signature);

//   return signature;
// };

// // Slash stake (send money to penalty wallet)
// export const slashStake = async (
//   apartmentId: string,
//   stakeRecord: any,
//   apartmentOwnerPubkey: string,
//   wallet: WalletContextState
// ): Promise<string> => {
//   if (!wallet.publicKey || !wallet.sendTransaction) {
//     throw new Error('Wallet not connected');
//   }

//   const tenantProfileId = stakeRecord.tenant_profile_id;
//   const apartmentHash = Array.from(hashString(apartmentId));
//   const profileHash = Array.from(hashString(tenantProfileId));
  
//   const apartmentOwner = new PublicKey(apartmentOwnerPubkey);
//   const escrowPDA = getApartmentEscrowPDA(apartmentId);
//   const stakeRecordPDA = getStakeRecordPDA(apartmentId, tenantProfileId);

//   // Create instruction data
//   const buffer = Buffer.alloc(1000);
//   SlashStakeSchema.encode({
//     apartmentHash,
//     profileHash,
//     apartmentId,
//     tenantProfileId,
//     apartmentOwner,
//   }, buffer);

//   const encodedSize = SlashStakeSchema.getSpan(buffer);
//   const instructionData = buffer.subarray(0, encodedSize);

//   // Create instruction
//   const instruction = new TransactionInstruction({
//     keys: [
//       { pubkey: new PublicKey(escrowPDA), isSigner: false, isWritable: true },
//       { pubkey: new PublicKey(stakeRecordPDA), isSigner: false, isWritable: true },
//       { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
//       { pubkey: new PublicKey(PENALTY_WALLET), isSigner: false, isWritable: true },
//     ],
//     programId: PROGRAM_ID,
//     data: Buffer.concat([
//       Buffer.from([190, 242, 137, 27, 41, 18, 233, 37]), // slash_stake discriminator
//       instructionData
//     ]),
//   });

//   // Create and send transaction
//   const transaction = new Transaction().add(instruction);
//   const connection = new Connection('https://api.devnet.solana.com');
  
//   const signature = await wallet.sendTransaction(transaction, connection);
//   await connection.confirmTransaction(signature);

//   return signature;
// };

// // Fetch stake records for an apartment
// export const fetchStakeRecords = async (apartmentId: string): Promise<any[]> => {
//   try {
//     const programAccounts = await rpc.getProgramAccounts(address(PROGRAM_ID.toBase58() as Address), {
//       encoding: 'base64'
//     }).send();

//     const stakeRecords = [];
    
//     for (const accountInfo of programAccounts) {
//       try {
//         const buffer = Buffer.from(accountInfo.account.data[0], 'base64');
        
//         // Check if this account has the right discriminator for StakeRecord
//         const expectedDiscriminator = [174, 163, 11, 208, 150, 236, 11, 205];
//         const actualDiscriminator = Array.from(buffer.slice(0, 8));
        
//         if (JSON.stringify(actualDiscriminator) === JSON.stringify(expectedDiscriminator)) {
//           const accountData = buffer.slice(8);
//           const decoded = StakeRecordSchema.decode(accountData);
          
//           // Only include stakes for this apartment
//           if (decoded.apartment_id === apartmentId) {
//             stakeRecords.push({
//               ...decoded,
//               amount: decoded.amount.toString(),
//               address: accountInfo.pubkey
//             });
//           }
//         }
//       } catch (e) {
//         continue;
//       }
//     }
    
//     return stakeRecords;
//   } catch (error) {
//     console.error('Error fetching stake records:', error);
//     return [];
//   }
// };

// // Check if escrow exists
// export const checkEscrowExists = async (apartmentId: string): Promise<boolean> => {
//   try {
//     const escrowPDA = getApartmentEscrowPDA(apartmentId);
//     const { value: escrowAccount } = await rpc.getAccountInfo(escrowPDA, { encoding: 'base64' }).send();
//     return escrowAccount !== null;
//   } catch (error) {
//     return false;
//   }
// }; 