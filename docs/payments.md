# Payment Rewind Plan

## Current behavior

When game over, clicking "Back in Time" opens a popup asking how many steps to rewind. The user enters a number (1–100) and the game rewinds for free.

## Target behavior

The user must pay **100 sats per step** before rewinding. For N steps, the cost is N × 100 sats.

## User flow

```
[Game Over]
    ↓
[Popup: "Back in Time — How many steps?" (number input) "Cost: 500 sats (100/step)"]
    ↓
[Buttons: Cancel | Pay & Rewind]
    ↓  (user clicks "Pay & Rewind")
[Bitcoin Connect payment modal opens — user pays in their wallet]
    ↓  (user approves payment)
[Rewind animation plays — snake reverses step by step at 100ms/step]
    ↓
[3-2-1-Go! countdown]
    ↓
[Game resumes at the restored state]
```

## Payment recipient

All payments must be sent to **rolznz@getalby.com** (Alby wallet). An invoice for the required amount (steps × 100 sats) is generated programmatically using [`@getalby/lightning-tools`](https://www.npmjs.com/package/@getalby/lightning-tools) against this lightning address:

## Technical approach


### SDK: @getalby/bitcoin-connect (via CDN)

Use the Bitcoin Connect browser SDK which provides:

- **Wallet onboarding** — guides users without a wallet to create one (Alby Hub or extension)
- **Payment modal** — shows invoice in the user's wallet; no custom payment UI needed
- **Invoice creation + confirmation** — creates a NIP-47 invoice and waits for payment
- **Balance checking** — can check if wallet has sufficient funds before prompting payment

### Lightning Tools: Invoice generation

Install the NPM package `@getalby/lightning-tools`. Use the `LightningAddress` class to request a BOLT-11 invoice from the recipient's lightning address:

```ts
import { LightningAddress } from "@getalby/lightning-tools/lnurl";

const ln = new LightningAddress("rolznz@getalby.com");
await ln.fetch();
const invoice = await ln.requestInvoice({ satoshi: 500 }); // steps × 100
```

Check if the invoice was paid:

```ts
const isPaid = await invoice.isPaid();
```

### Browser integration

For browser use without a build step, import via CDN:

```html
<script src="https://esm.sh/@getalby/lightning-tools@^8.1.0"></script>
```

### Files to modify

#### 1. `index.html`

- Add Bitcoin Connect SDK script tag
- Update rewind popup to show cost next to the input
- Rename "Go!" button to "Pay & Rewind"
- Add CSS for any new overlay elements Bitcoin Connect injects

#### 2. `game.js`

New functions and changes:

**`initPaymentSDK()`** — initialize Bitcoin Connect with app name "Snake Game"

**`payAndRewind()`** — orchestrates the payment + rewind flow:
1. Read steps from input, validate range
2. Calculate cost = steps × 100
3. Check wallet balance (if wallet exists) — if insufficient, warn user
4. Call Bitcoin Connect to create invoice for `cost` sats
5. Wait for payment confirmation
6. On success: hide popup, call existing `undoSteps()`
7. On failure/cancel: show error toast, close popup, stay on game over

**`showUndoPopup()`** — update to display cost line:
```
Cost: 500 sats (100/step)
```

**`undoSteps()`** — no changes to rewind animation logic; only called after payment succeeds

**State tracking:**
- `paymentLoading` boolean — disable buttons during payment to prevent double-clicks

## Edge cases & error handling

| Scenario | Behavior |
|---|---|
| User has no wallet | Bitcoin Connect onboarding flow — guide user to Alby Hub |
| Insufficient balance | Show "Insufficient balance" toast; user can try fewer steps |
| User cancels payment | Close popup; game stays on game over screen |
| Payment times out | Show "Payment timed out"; let user retry with fewer steps |
| Network error | Show "Connection error"; let user retry |
| Step value = 0 or invalid | Don't proceed; show validation message |

## What stays the same

- Game rendering, canvas, grid, snake logic, collision detection
- Rewind animation (100ms per step)
- Countdown overlay (3-2-1-Go!)
- Score restoration after rewind
- State history (max 100 snapshots)

## Security notes

- Bitcoin Connect handles the NWC connection secret from the user's wallet
- No secrets are hardcoded; everything runs client-side via the user's own wallet connection
- The game has no wallet access — it only creates invoices via NWC
