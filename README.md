# Universal-PactPay-Blink-API

PactPay is a hybrid escrow protocol that combines **Stripe fiat payments** with **blockchain‑verified consensus** to enable trust‑minimized agreements between two untrusted parties.  
Both participants stake funds, agree on contract terms, and must cryptographically approve the outcome before any money is released.

Unlike traditional escrow, PactPay requires **symmetric collateral**, ensuring neither side can abuse the agreement without also risking their own stake.

---

## 🚀 Motivation

Freelancers, collaborators, and online counterparties often lack trust.  
Standard escrow protects only one side, while informal agreements have no enforcement.

PactPay introduces:

- Mutual staking
- Cryptographic approvals
- Tamper‑proof resolution
- Fiat + crypto compatibility

This creates a system where **breaking the contract is always costly**, making cooperation the rational choice.

---

## 🧠 Core Idea

1. Two users create a contract with terms.
2. Both stake collateral.
3. Contract terms are hashed and recorded on-chain.
4. Resolution requires signed approvals.
5. Fiat funds are released only after on‑chain consensus.

The blockchain decides the outcome.  
Stripe executes the money movement.

--- 
### Responsibilities

| Component | Role |
|----------|---------|
| Blockchain | Contract hash, participants, approvals, resolution |
| Stripe | Holds fiat escrow funds |
| Backend API | Syncs Stripe with blockchain events |
| Frontend | Room creation, staking, approval, resolution |

---

## 🔄 Contract Lifecycle

### 1. Create Room
- Creator defines terms, stakes, and reward
- Terms stored off‑chain
- Hash stored on‑chain

### 2. Join Room
- Second user joins with code
- Both approve contract

### 3. Stake Funds
- Both deposit fiat via Stripe PaymentIntent
- Funds held in platform balance

### 4. Activate Contract
- Contract becomes ACTIVE when both stakes received

### 5. Resolve Contract

Possible outcomes:

#### ✅ Success
Both approve completion  
→ Stakes returned  
→ Reward paid

#### 🤝 Mutual Cancel
Both approve cancel  
→ Stakes returned

#### ❌ Slash
One party slashes  
→ Both stakes forfeited

#### ⏱ Timeout (optional)
Auto‑resolution after deadline

---

## 🔐 Signature‑Based Consensus

Users sign a message with their wallet:


## 🏗 Architecture

Smart contract verifies:
- signer address
- contract id
- approval count

When consensus reached → event emitted → backend executes payout.

This prevents the backend from arbitrarily releasing funds.

---

## 💳 Stripe Integration

Used features:

- PaymentIntents — collect stakes
- Connect — multi‑party payments
- Transfers — payout / refund
- Webhooks — payment state sync

Funds remain locked until blockchain consensus is reached.

---

## ⛓ Smart Contract Role

- Store contract hash
- Verify signatures
- Track approvals
- Emit resolution events
- Prevent unilateral payout

Blockchain acts as the **source of truth**.

---

## 🌐 API Endpoints

---

## 🎯 Key Features

- Symmetric escrow with collateral
- Fiat escrow using Stripe
- On‑chain consensus verification
- Digital signature approvals
- Deterministic resolution
- Hackathon‑ready Web API

---

## 🔮 Future Work

- Fully on‑chain escrow
- DAO arbitration
- Multi‑party contracts
- Reputation system
- Conditional triggers (API / oracle)
- Cross‑chain support

---

## 🏆 Submission Categories

- Stripe API
- Blockchain / Smart Contracts
- Fintech / Payments
- Most Creative
- Best General Hack

---

## 👥 Team

Built at HackIllinois 2026
