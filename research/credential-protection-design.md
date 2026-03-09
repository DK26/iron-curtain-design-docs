# Credential Protection at Rest — Design Specification

> **Status:** Design study  
> **Resolves:** Underspecified `CredentialStore` in D047 (byollm-implementation-spec §2.3), identity key encryption in D052/D061, backup credential safety  
> **Cross-references:** D034 (SQLite), D047 (LLM config), D052 (community servers/signed credentials), D061 (data backup), D074 (server secrets), 06-SECURITY (threat model V61)

## Problem Statement

Iron Curtain is open source — anyone can read the database schema, file paths, and encryption code. An attacker who gains same-user access (malware, shared machine, physical access to unlocked session) can write a trivial tool that:

1. Reads `profile.db` and extracts OAuth tokens, API keys from known columns
2. Copies `keys/identity.key` and brute-forces a weak passphrase
3. Reads community credential stores for signed records

**The current design says "encrypted at rest" but does not fully specify where the encryption key lives.** The byollm-implementation-spec's `derive_machine_key()` fallback (MAC address + username + fixed salt → PBKDF2) is deterministic given the machine — an attacker running as the same user can reproduce it. This is obfuscation, not encryption.

## Threat Model

| Threat                              | Severity   | Example                                                        |
| ----------------------------------- | ---------- | -------------------------------------------------------------- |
| Same-user malware reads SQLite      | **HIGH**   | Trojan reads `profile.db`, exfiltrates OAuth tokens + API keys |
| Physical access to unlocked machine | **MEDIUM** | Shared gaming cafe PC, stolen unlocked laptop                  |
| Disk image forensics                | **MEDIUM** | Attacker images disk of powered-off machine                    |
| Remote code execution via mod       | **HIGH**   | Malicious WASM mod or Lua script attempts filesystem access    |
| Backup file theft                   | **MEDIUM** | Attacker obtains unencrypted `.zip` backup                     |
| Memory dump of running process      | **LOW**    | Requires elevated privileges or debugger access                |

**Out of scope:** Kernel-level rootkits, hardware keyloggers, compromised OS keyring daemon. These defeat all user-space protections. IC's threat model matches the OS security boundary — if the OS is compromised, no user-space application can protect secrets.

## Sensitive Data Inventory

| Data                           | Storage                                            | Risk if Stolen                                                                            |
| ------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Ed25519 player private key** | `keys/identity.key`                                | Full identity takeover — forge SCRs, impersonate player                                   |
| **OAuth access tokens**        | `profile.db` → `llm_providers.oauth_token`         | Use victim's LLM provider account, incur billing                                          |
| **OAuth refresh tokens**       | `profile.db` → `llm_providers.oauth_refresh_token` | Long-lived — mint new access tokens indefinitely                                          |
| **API keys**                   | `profile.db` → `llm_providers.api_key`             | Same as OAuth — full provider account access                                              |
| **Social recovery shards**     | community credential SQLite                        | Partial — K-1 shards reveal nothing (Shamir), but each stolen shard reduces the threshold |
| **Server admin passwords**     | `secrets.toml`                                     | Server takeover                                                                           |

**Non-sensitive (integrity-protected, not confidentiality-protected):**
- SCRs (signed credential records) — publicly verifiable, not secret
- Community public keys — public by definition
- Match history, achievements, telemetry — privacy concern but not credential theft

## Design: Three-Tier Credential Protection

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  ic-llm, ic-net (D052), ic-game                             │
│  Requests: store_secret(), retrieve_secret()                │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  CredentialStore (ic-paths)                   │
│  Unified API — callers don't know which backend is active    │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Tier 1:    │  │   Tier 2:    │  │     Tier 3:      │   │
│  │  OS Keyring  │  │ Vault Pass-  │  │   Session-Only   │   │
│  │  (primary)   │  │ phrase (fb)  │  │     (WASM)       │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│   keyring crate     Argon2id KDF     In-memory only,         │
│   DPAPI/Keychain    User-provided    re-enter each session   │
│   /Secret Service   password once                            │
└─────────────────────────────────────────────────────────────┘
```

### Tier 1: OS Credential Store (Primary — Desktop)

**Implementation:** The Rust `keyring` crate (MIT/Apache-2.0, actively maintained, cross-platform).

| Platform         | Backend                                     | Key Protection                                                                           |
| ---------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Windows          | Credential Manager (DPAPI)                  | Tied to Windows user login session + machine key. Encrypted with user's login password.  |
| macOS            | Keychain                                    | Tied to user login keychain. Can require additional authentication (Touch ID, password). |
| Linux (with DE)  | Secret Service (GNOME Keyring / KDE Wallet) | Unlocked with user login password. Encrypted at rest.                                    |
| Linux (headless) | **Not available** → fall back to Tier 2     | —                                                                                        |

**What gets stored in the OS keyring:**

IC does NOT store each individual secret in the OS keyring. Instead, it stores a single **Data Encryption Key (DEK)** in the keyring, and uses that DEK to encrypt all secrets in SQLite. This approach:

- Minimizes keyring entries (one per IC installation, not one per provider)
- Keeps the keyring API surface tiny (set one key, get one key)
- Allows bulk secret operations without repeated keyring roundtrips
- Works around GNOME Keyring's CVE-2018-19358 limitation (if an attacker can read one entry, they can read all — so protecting one master key is equivalent to protecting N individual keys)

**Key management:**

```
First launch:
  1. Generate random 256-bit DEK (CSPRNG)
  2. Store DEK in OS keyring: service="iron-curtain", user="vault-dek"
  3. Use DEK to encrypt all secrets written to SQLite

Subsequent launches:
  1. Retrieve DEK from OS keyring
  2. Decrypt secrets from SQLite as needed
  3. Zeroize DEK from memory when no longer needed

DEK rotation (optional, user-triggered):
  1. Retrieve old DEK
  2. Decrypt all secrets
  3. Generate new DEK
  4. Re-encrypt all secrets with new DEK
  5. Store new DEK in keyring
  6. Zeroize old DEK
```

**Security properties:**
- DEK never touches disk in plaintext (lives only in OS keyring and in-memory)
- SQLite columns contain AES-256-GCM ciphertext, not plaintext
- Same-user malware CAN access the OS keyring (this is true for ALL desktop apps — VS Code, Chrome passwords, Git credentials all have this limitation). But it requires active code execution, not just file copying.
- Disk forensics cannot recover secrets without the user's OS login password

### Tier 2: Vault Passphrase (Fallback — No OS Keyring)

When the OS keyring is unavailable (headless Linux without D-Bus, containers, minimal window managers without Secret Service, portable mode on USB drive):

**The user must set a vault passphrase.** This is prompted once per session (on first access to any secret), not on every operation.

```
┌──────────────────────────────────────────────────────────────┐
│  🔒 Unlock Your AI Credentials                               │
│                                                              │
│  Your AI provider logins are protected by a passphrase.      │
│  Enter it to use your cloud AI providers this session.       │
│                                                              │
│  Passphrase: [••••••••••••••]                                │
│                                                              │
│  [Unlock]  [Use Built-in AI Instead]                         │
│                                                              │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄                        │
│  Forgot passphrase? [Reset Vault]                            │
│  (This will clear your saved logins. You'll need to sign     │
│  in to your AI providers again.)                             │
└──────────────────────────────────────────────────────────────┘
```

**UX notes:**
- The prompt appears only when the player triggers an LLM action, not at game launch.
- **[Use Built-in AI Instead]** is always available — the player can play without entering a passphrase.
- **[Reset Vault]** provides a discoverable escape hatch for forgotten passphrases — no console command required. It shows a confirmation dialog explaining that saved provider logins will be cleared but provider settings (name, model, endpoint) are preserved.
- Language uses "passphrase" (matches Settings → Data → Security terminology) and "AI provider logins" (player mental model), not "DEK" or "credential encryption key."

**Key derivation:**

```
passphrase (user input)
    │
    ▼
Argon2id(passphrase, salt=random_128bit, t=3, m=65536 KiB, p=1)
    │
    ▼
256-bit DEK → encrypt/decrypt secrets in SQLite
```

**Parameters:**
- **Algorithm:** Argon2id (memory-hard, resists GPU/ASIC brute-forcing) — OWASP 2024 recommended
- **Time cost (t):** 3 iterations — balances security with <1s unlock time on 2012 laptops
- **Memory cost (m):** 64 MiB — significant for brute-forcing, modest for a game PC
- **Parallelism (p):** 1 — single-threaded derivation
- **Salt:** Random 128-bit, stored in plaintext in `profile.db` metadata table
- **Output:** 256-bit DEK

**Salt storage:**

```sql
-- In profile.db (or a dedicated vault.db)
CREATE TABLE vault_meta (
    key     TEXT PRIMARY KEY,
    value   BLOB NOT NULL
);
-- Entries:
-- ('dek_salt', <128-bit random salt>)
-- ('dek_verification', <HMAC-SHA256(DEK, "iron-curtain-vault-verify")>)
-- ('argon2_params', <JSON: {"t":3, "m":65536, "p":1, "version":19}>)
```

The `dek_verification` entry allows IC to check whether the user entered the correct passphrase without attempting to decrypt actual credentials. If the derived DEK produces the expected HMAC, the passphrase is correct.

**Passphrase lifecycle:**
- Set during first use of any feature requiring secrets
- Prompted once per session (or once per N hours, configurable)
- Can be changed via `ic vault change-passphrase` (re-derives DEK, re-encrypts all secrets)
- If forgotten: secrets are unrecoverable (but API keys can be regenerated at the provider, and identity keys can be recovered via BIP-39 mnemonic)

### Tier 3: Session-Only (WASM / Extreme Fallback)

For browser (WASM) builds where neither OS keyring nor persistent passphrase derivation is practical:

- Secrets exist only in memory for the current session
- User re-enters API keys or re-authenticates OAuth each session
- `localStorage` / `IndexedDB` store only non-sensitive preferences
- Explicit warning: "Browser sessions do not persist LLM credentials. You will need to re-enter them each time."

This is acceptable for WASM because the browser's own security model provides the containment boundary.

## Encryption Scheme: AES-256-GCM

All secret columns in SQLite are encrypted using AES-256-GCM with the DEK.

**Per-value encryption (not whole-database):**

IC encrypts individual column values, not the entire SQLite database. This is deliberate:

- **SQLCipher** (whole-database encryption) requires a non-standard SQLite build, complicates `rusqlite` integration, and prevents partial reads of non-sensitive data. It also requires the key for ANY database access — even reading non-sensitive columns.
- **Per-column encryption** lets IC read provider names, display settings, etc. without unlocking the vault. Only the sensitive columns (`api_key`, `oauth_token`, `oauth_refresh_token`) require the DEK.

**Encrypted column format:**

```
┌──────────────────────────────────────────────────────────┐
│  Version (1 byte) │ Nonce (12 bytes) │ Ciphertext + Tag │
│       0x01        │   random/unique  │   AES-256-GCM    │
└──────────────────────────────────────────────────────────┘
```

- **Version byte:** Allows future algorithm changes (0x01 = AES-256-GCM)
- **Nonce:** 96-bit, randomly generated per encryption operation (CSPRNG)
- **Tag:** 128-bit GCM authentication tag (appended to ciphertext by GCM)
- **AAD (additional authenticated data):** `"ic-credential-v1:" || table_name || ":" || column_name || ":" || row_id` — binds the ciphertext to its storage location, preventing column/row swapping attacks

**Rust crate:** `aes-gcm` (RustCrypto project, MIT/Apache-2.0, `#![no_std]` compatible, audited).

## Memory Protection

Secrets decrypted from SQLite are held in memory only while actively needed and then zeroized.

**Implementation:** The `zeroize` crate (RustCrypto project, MIT/Apache-2.0) provides:
- `Zeroize` trait: overwrite memory with zeros on drop
- `Zeroizing<T>` wrapper: automatic zeroize on drop
- Compiler barrier against dead-store elimination

```rust
use zeroize::Zeroizing;

// DEK is zeroized when dropped
let dek: Zeroizing<[u8; 32]> = credential_store.retrieve_dek()?;

// Decrypted API key is zeroized after use
let api_key: Zeroizing<String> = credential_store.decrypt_secret(&dek, encrypted_blob)?;
provider.authenticate(&api_key)?;
// api_key dropped here → memory zeroed
```

**Limitations (honest assessment):**
- Zeroize cannot prevent the OS from paging secrets to swap. Users concerned about this should enable full-disk encryption (standard advice for any security-sensitive application).
- Zeroize cannot prevent a debugger from reading process memory. This requires elevated privileges — same threat level as a keylogger.
- The JIT in WASM targets may optimize away zeroization. The `zeroize` crate handles this for native targets; WASM builds accept this limitation (Tier 3 is session-only anyway).

## Crate Dependencies

All MIT/Apache-2.0, compatible with IC's GPL v3 with modding exception:

| Crate     | Purpose                          | License           | `#![no_std]`          |
| --------- | -------------------------------- | ----------------- | --------------------- |
| `keyring` | OS credential store access       | MIT OR Apache-2.0 | No (requires OS APIs) |
| `aes-gcm` | AES-256-GCM encryption           | MIT OR Apache-2.0 | Yes                   |
| `argon2`  | Argon2id KDF for Tier 2          | MIT OR Apache-2.0 | Yes                   |
| `zeroize` | Secret memory clearing           | MIT OR Apache-2.0 | Yes                   |
| `rand`    | CSPRNG for nonce/salt generation | MIT OR Apache-2.0 | Partial               |

**Crate home:** `ic-paths` (which already handles platform path resolution). The `CredentialStore` is a natural fit here because it needs platform-specific behavior and is used by multiple crates (`ic-llm`, `ic-net`/D052, `ic-game`).

## SQLite Schema Changes

### `profile.db` — Encrypted Credential Columns

The `llm_providers` table columns `api_key`, `oauth_token`, and `oauth_refresh_token` change from `TEXT` to `BLOB` — they now store the encrypted format described above, not plaintext strings.

```sql
CREATE TABLE llm_providers (
    -- ... non-sensitive columns unchanged ...
    api_key             BLOB,           -- AES-256-GCM encrypted; NULL for OAuth/builtin
    oauth_token         BLOB,           -- AES-256-GCM encrypted; NULL for API key/builtin
    oauth_refresh_token BLOB,           -- AES-256-GCM encrypted; NULL for non-OAuth
    -- ... rest unchanged ...
);
```

### `profile.db` — Vault Metadata Table

```sql
CREATE TABLE vault_meta (
    key     TEXT PRIMARY KEY,
    value   BLOB NOT NULL
);
-- ('backend', 'keyring' | 'passphrase' | 'session')
-- ('dek_salt', <128-bit random>)           -- only for passphrase backend
-- ('dek_verification', <HMAC-SHA256>)      -- only for passphrase backend
-- ('argon2_params', <JSON>)                -- only for passphrase backend
-- ('encrypted_column_version', 0x01)       -- format version
```

## CredentialStore API (Updated)

Replaces the underspecified version in byollm-implementation-spec §2.3:

```rust
use zeroize::Zeroizing;

/// Unified credential storage. Lives in ic-paths.
/// Callers (ic-llm, ic-net/D052, ic-game) use this API
/// without knowing which backend is active.
pub struct CredentialStore {
    backend: CredentialBackend,
    dek: Option<Zeroizing<[u8; 32]>>,
}

enum CredentialBackend {
    /// Tier 1: OS credential store (DPAPI / Keychain / Secret Service)
    OsKeyring,
    /// Tier 2: User passphrase → Argon2id → DEK
    Passphrase { salt: [u8; 16], params: Argon2Params },
    /// Tier 3: Session-only (WASM), no persistence
    SessionOnly,
}

impl CredentialStore {
    /// Detect available backend. Tries OS keyring first.
    pub fn open() -> Result<Self, CredentialError> { /* ... */ }

    /// Unlock the vault. No-op for OS keyring (always unlocked when
    /// user is logged in). Prompts for passphrase in Tier 2.
    pub fn unlock(&mut self) -> Result<(), CredentialError> { /* ... */ }

    /// Returns true if secrets are currently accessible.
    pub fn is_unlocked(&self) -> bool { /* ... */ }

    /// Encrypt and store a secret. Returns the encrypted blob
    /// for storage in SQLite.
    pub fn encrypt_secret(&self, plaintext: &[u8], aad: &[u8])
        -> Result<Vec<u8>, CredentialError> { /* ... */ }

    /// Decrypt a secret from its stored blob.
    pub fn decrypt_secret(&self, ciphertext: &[u8], aad: &[u8])
        -> Result<Zeroizing<Vec<u8>>, CredentialError> { /* ... */ }

    /// Lock the vault (zeroize DEK from memory).
    /// Subsequent decrypt calls will require re-unlock.
    pub fn lock(&mut self) { /* ... */ }
}
```

## Identity Key Protection (D052 / D061 Alignment)

The player's Ed25519 private key in `keys/identity.key` is already encrypted with a user passphrase via AEAD (D052). This design is **retained and reinforced:**

- The identity key passphrase and the vault passphrase are **independent**. The identity key has its own PBKDF2-HMAC-SHA512 derivation (BIP-39 spec). The vault passphrase (Tier 2 DEK) protects LLM credentials.
- Rationale: The identity key needs its own passphrase for BIP-39 mnemonic recovery (24 words + optional passphrase). Conflating the two passphrases would break the BIP-39 standard derivation path.
- A user may choose the same passphrase for both, but the system does not enforce or assume this.

## Backup Security (D061 Alignment)

**Current state:** `ic backup create` produces an unencrypted ZIP. The `keys/identity.key` inside is already encrypted (AEAD), but SQLite databases are readable.

**Updated design:** With per-column encryption, the SQLite databases in backups contain encrypted credential columns. Even if an attacker obtains the backup ZIP:
- `api_key`, `oauth_token`, `oauth_refresh_token` columns are AES-256-GCM ciphertext
- The DEK is NOT in the backup (it's in the OS keyring or derived from the vault passphrase)
- Non-sensitive data (settings, match history, achievements) remains readable — this is intentional for data portability

**Restoring backups:**
- If the user restores on the same machine with the same OS login: OS keyring still has the DEK → secrets decrypt normally
- If the user restores on a new machine: the DEK is lost → encrypted credentials are unrecoverable → user must re-enter API keys and re-authenticate OAuth (acceptable — API keys are always available from the provider's dashboard)
- BIP-39 mnemonic recovery for identity keys is unaffected (independent of DEK)

**Optional backup encryption (user responsibility, unchanged):** Users who want full backup encryption can use `7z -p` or `gpg`. IC documents this recommendation but does not implement ZIP-level encryption. The per-column encryption ensures credentials are protected even without full backup encryption.

## Decryption Failure Recovery

When the `CredentialStore` cannot decrypt stored credentials — whether the DEK is lost (new machine, keyring cleared, OS reinstall), the vault passphrase is forgotten, or the encrypted blob is corrupted — the engine must handle the failure gracefully. **The player is never left with a cryptic error or broken provider state.** The principle: fail-safe to "re-enter" rather than fail-open to "exposed" or fail-hard to "unusable."

### When Decryption Fails

| Scenario                            | Detection                                        | Behavior                                                                                                       |
| ----------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| OS keyring entry missing (Tier 1)   | `keyring::Entry::get_secret()` returns `NoEntry` | Attempt Tier 2. If no vault passphrase configured, treat all encrypted columns as lost — prompt re-entry.      |
| Vault passphrase wrong (Tier 2)     | `dek_verification` HMAC mismatch                 | Allow 3 retry attempts. After 3 failures, offer: `[Try Again]` / `[Reset Credentials]`.                        |
| Vault passphrase forgotten (Tier 2) | User selects "I forgot my passphrase"            | Purge all encrypted columns, reset `vault_meta`, prompt user to re-enter credentials and set a new passphrase. |
| Encrypted blob corrupted            | GCM tag verification fails on `decrypt_secret()` | Mark the specific provider as needing re-authentication. Other providers unaffected.                           |
| Format version unrecognized         | Version byte ≠ 0x01                              | Same as corruption — mark provider for re-entry. Log warning for diagnostics.                                  |
| WASM session expired (Tier 3)       | No persistent store by design                    | Normal behavior — prompt on every session start.                                                               |

### User-Facing Prompt

When one or more providers have unreadable credentials, IC does NOT show a notification immediately at launch or on the main menu. The notification appears **only when the player triggers an action that needs the broken provider** (starting a skirmish with AI coaching, opening mission generator, etc.). This follows principle #5 (Progressive Disclosure) — don't surface problems the player hasn't encountered yet. If built-in AI can silently handle the task, no notification appears at all.

**Notification (non-blocking banner, not modal dialog):**

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠ Some AI features need your attention                      │
│                                                              │
│  Iron Curtain can't access your saved login for:             │
│                                                              │
│  • My OpenAI — needs sign-in                                │
│  • Claude — needs sign-in                                   │
│                                                              │
│  This usually happens after moving to a new computer or      │
│  reinstalling your OS. Your settings are safe — just sign    │
│  back in.                                                    │
│                                                              │
│  [Fix Now →]  [Use Built-in AI]  [Not Now]                   │
└──────────────────────────────────────────────────────────────┘
```

**UX design rules (aligned with `17-PLAYER-FLOW.md` § UX Principles):**

| Principle                       | Application                                                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No Dead-End Buttons (#3)**    | [Fix Now →] navigates directly to the affected provider's edit form (not the generic LLM settings page). If multiple providers are affected, it opens the LLM settings list with `⚠` badges on each. |
| **Progressive Disclosure (#5)** | The notification only appears when the player attempts an action requiring the broken provider. If Tier 1 built-in AI can satisfy the request, it does so silently — no notification.                |
| **One-Second Rule (#6)**        | Title says "AI features need your attention" (player's mental model), not "LLM Provider Credentials" (engineer's mental model). Body uses "sign-in" not "re-authenticate" or "re-enter API key."     |
| **Three Clicks (#2)**           | [Fix Now →] → credential field focused → paste key + Save = 3 actions from notification to resolution.                                                                                               |
| **Context-Sensitive (#7)**      | The notification names the specific providers and uses the player's custom names ("My OpenAI"), not internal IDs.                                                                                    |

**Notification suppression:**
- **[Not Now]** dismisses for the current session. The notification re-appears next session only if the player again triggers an LLM action needing the broken provider.
- **[Use Built-in AI]** sets a per-session flag to route all LLM tasks to built-in models. The notification does NOT re-appear this session. Providers keep their `⚠` badges in Settings → LLM for when the player is ready to fix them.
- If the player fixes one provider but not others, only unfixed providers show `⚠`.
- **Never nag.** If the player dismisses twice across sessions, the notification frequency drops to once per week (tracked in `profile.db`). The player can always fix providers proactively via Settings → LLM.

**Provider card in Settings → LLM (healthy vs. needs attention):**

```
┌─ Healthy ──────────────────────────────────────────────┐
│  ✓ My OpenAI                                           │
│    Model: gpt-4o-mini · Endpoint: api.openai.com       │
│    Tasks: Orchestrator, Coaching     [Edit] [Remove]   │
└────────────────────────────────────────────────────────┘

┌─ Needs attention ──────────────────────────────────────┐
│  ⚠ Claude                                              │
│    Model: claude-sonnet-4 · Endpoint: api.anthropic.com│
│    ⚠ Saved login expired or unavailable                │
│    Tasks: Mission Generation         [Sign In] [Remove]│
└────────────────────────────────────────────────────────┘
```

The `[Sign In]` button replaces `[Edit]` for broken providers — it opens the edit form with the credential field focused and a contextual help line: "Paste your API key from your provider's dashboard, or click Sign In to log in again."

**No-dead-end guidance panel (principle #3):**

When the player triggers an LLM-gated feature and the assigned provider is broken, instead of an inline error string, IC shows the standard no-dead-end guidance panel pattern (same as "New Generative Campaign without LLM" or "Campaign without content"):

```
┌──────────────────────────────────────────────────────────────┐
│  This feature uses AI (Claude), which needs to be            │
│  reconnected after your system change.                       │
│                                                              │
│  [Reconnect Claude →]                                        │
│  [Use Built-in AI Instead →]                                 │
│  [Cancel]                                                    │
└──────────────────────────────────────────────────────────────┘
```

This ensures the player ALWAYS has a forward path — they can fix the provider, fall back to built-in, or cancel. No dead ends.

### CredentialStore API: Failure Handling

```rust
/// Error variants relevant to decryption failure recovery.
pub enum CredentialError {
    /// DEK not available — keyring missing, passphrase not provided.
    DekUnavailable,
    /// GCM tag verification failed — wrong DEK or corrupted blob.
    DecryptionFailed { provider_id: i64, column: String },
    /// Unrecognized version byte in encrypted blob.
    UnknownFormat { version: u8 },
    /// Keyring backend error (OS-specific).
    KeyringError(keyring::Error),
    /// Argon2 derivation error.
    KdfError(argon2::Error),
}

impl CredentialStore {
    /// Attempt to decrypt all credential columns for all providers.
    /// Returns a list of provider IDs whose credentials are unreadable.
    /// Non-sensitive data (name, endpoint, model) is always readable.
    pub fn check_provider_credentials(
        &self,
        db: &rusqlite::Connection,
    ) -> Vec<CredentialHealthEntry> { /* ... */ }

    /// Purge encrypted credential columns for a specific provider,
    /// resetting them to NULL. The provider remains configured
    /// (name, endpoint, model preserved) but needs re-authentication.
    pub fn reset_provider_credentials(
        &self,
        db: &rusqlite::Connection,
        provider_id: i64,
    ) -> Result<(), CredentialError> { /* ... */ }

    /// Nuclear option: purge ALL encrypted credentials and reset
    /// vault_meta. Used when the user has forgotten their vault
    /// passphrase and wants to start fresh.
    pub fn reset_all_credentials(
        &self,
        db: &rusqlite::Connection,
    ) -> Result<(), CredentialError> { /* ... */ }
}

pub struct CredentialHealthEntry {
    pub provider_id: i64,
    pub provider_name: String,
    pub status: CredentialHealth,
}

pub enum CredentialHealth {
    /// Credentials decrypted successfully.
    Ok,
    /// Could not decrypt — needs re-entry.
    NeedsReentry { reason: String },
    /// No credentials stored (expected for Tier 1 built-in / Tier 4 local).
    NotApplicable,
}
```

### Console Commands

```
/llm credentials check          # List all providers with credential health status
/llm credentials reset <name>   # Reset credentials for a specific provider
/llm credentials reset-all      # Nuclear: purge all credentials (prompts confirmation)
/vault reset                    # Reset vault passphrase (purges all encrypted data, prompts new passphrase)
```

Console commands are the power-user path. The same operations are accessible through the UI:
- Settings → LLM → provider card → [Sign In] (per-provider reset)
- Settings → Data → Security → [Reset All AI Logins] (purge all credentials)
- Settings → Data → Security → [Change Vault Passphrase] / [Reset Vault Passphrase] (Tier 2 only, visible when vault passphrase is active)

### Startup Credential Health Check

On game launch, the `CredentialStore` runs `check_provider_credentials()` during the loading phase (after `profile.db` is opened, before the main menu renders). This check is fast (one SELECT + N decrypt attempts, where N is the number of configured providers — typically 1-3). If any providers are unhealthy, the notification is queued for display when the player first navigates to a screen that triggers LLM usage (e.g., starting a skirmish with AI coaching enabled, or opening the mission generator). The check does NOT block the main menu.

## Server Secrets (D074 Alignment)

Server-side credentials in `secrets.toml` are a different concern:
- Servers are operated by administrators, not end users
- File permissions (0600 on Unix, NTFS ACLs on Windows) are the primary protection
- Password hashing (Argon2id) protects stored authentication credentials
- Environment variables (`IC_ICRP_PASSWORD`, etc.) avoid secrets in files entirely
- The `CredentialStore` design does NOT apply to server-side secrets — servers don't have an interactive user to provide a keyring or passphrase

This is consistent with how every server application handles secrets (nginx, PostgreSQL, Caddy, etc.).

## Migration: Plaintext → Encrypted

When a user upgrades from a pre-encryption IC version to one with `CredentialStore`:

1. On first launch, IC detects plaintext credential columns (no version byte prefix)
2. IC initializes the `CredentialStore` (Tier 1 or Tier 2)
3. Each plaintext credential is encrypted in-place with the new DEK
4. The `vault_meta` table is created with the backend type and format version
5. After migration, plaintext values no longer exist in the database

This migration is automatic and transparent. No user action required for Tier 1 (OS keyring). Tier 2 users are prompted to set a vault passphrase during migration.

## What This Does NOT Protect Against

Honest threat assessment — these are inherent limitations, not design failures:

1. **Same-user malware with OS keyring access:** On Windows/macOS, any process running as the logged-in user can access DPAPI/Keychain. On Linux, any process with D-Bus access can query Secret Service (CVE-2018-19358). This is the security boundary of ALL desktop applications. Chrome passwords, VS Code tokens, Git credentials are all vulnerable to the same attack.

2. **Attacker who knows the vault passphrase:** If the Tier 2 passphrase is weak or compromised, the DEK is recoverable. Argon2id makes brute-forcing expensive but not impossible for weak passphrases.

3. **Swap file / hibernation leaks:** Decrypted secrets in memory may be paged to disk. Mitigation: full-disk encryption (user's responsibility) or `mlock()` (best-effort, requires elevated privileges on some platforms).

4. **Mod sandbox escape:** If a WASM or Lua mod escapes its sandbox, it runs as the game process and can access anything the game can. The WASM sandbox (D005) and Lua sandbox (D004) are the defense here, not the credential store.

**The `CredentialStore` raises the bar from "copy a SQLite file" to "execute code as the user on a running session."** This is a meaningful security improvement for the most common attack vectors: disk theft, backup theft, and casual snooping.

## Phase Mapping

| Component                                         | Phase   | Milestone |
| ------------------------------------------------- | ------- | --------- |
| `CredentialStore` in `ic-paths` (Tier 1 + Tier 2) | Phase 2 | M2        |
| Identity key encryption (already designed)        | Phase 2 | M2        |
| LLM credential encryption (D047)                  | Phase 7 | M11       |
| WASM session-only tier                            | Phase 7 | M11       |
| `ic vault change-passphrase` CLI                  | Phase 2 | M2        |
| Backup credential safety (D061)                   | Phase 2 | M2        |

## Reference Implementations Studied

| Application                | Approach                                           | Notes                                            |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| **Git Credential Manager** | OS keyring via `libsecret` / DPAPI / Keychain      | Same pattern as IC Tier 1                        |
| **VS Code**                | OS keyring for tokens                              | Exactly Tier 1 pattern                           |
| **Bitwarden**              | Master password → PBKDF2/Argon2 → AES-256-CBC-HMAC | Equivalent to IC Tier 2                          |
| **KeePass**                | Master password + optional key file → AES-256      | IC omits key file (unnecessary for game context) |
| **Firefox**                | NSS + optional master password                     | Equivalent to Tier 1 + optional Tier 2           |
| **1Password**              | SRP + account key + master password → encryption   | Over-engineered for IC's use case (cloud sync)   |
| **Signal Desktop**         | OS keyring for database key (SQLCipher)            | IC uses per-column instead of SQLCipher          |
