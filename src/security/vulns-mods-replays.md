## Vulnerability 6: Replay Tampering

### The Problem
Modified replay files to fake tournament results.

### Mitigation: Signed Hash Chain

```rust
pub struct SignedReplay {
    pub data: ReplayData,
    pub server_signature: Ed25519Signature,
    pub hash_chain: Vec<(u64, u64)>,  // tick, cumulative_hash
}

impl SignedReplay {
    pub fn verify(&self, server_public_key: &PublicKey) -> bool {
        // 1. Verify server signature
        // 2. Verify hash chain integrity (tampering any tick invalidates all subsequent)
    }
}
```

## Vulnerability 7: Reconciler as Attack Surface

### The Problem
If the client accepts "corrections" from an external authority (cross-engine reconciler), a fake server could send malicious corrections.

### Mitigation: Bounded and Authenticated Corrections

```rust
fn is_sane_correction(&self, c: &EntityCorrection) -> bool {
    match &c.field {
        CorrectionField::Position(new_pos) => {
            let current = self.sim.entity_position(c.entity);
            let max_drift = MAX_UNIT_SPEED * self.ticks_since_sync;
            current.distance_to(new_pos) <= max_drift
        }
        CorrectionField::Credits(amount) => {
            *amount >= 0 &&
            (*amount - self.last_known_credits).abs() <= MAX_CREDIT_DELTA
        }
    }
}
```

All corrections must be: signed by the authority, bounded to physically possible values, and rejectable if suspicious.

## Vulnerability 8: Join Code Brute-Forcing

### The Problem
Join codes (e.g., `IRON-7K3M`) enable NAT-friendly direct joins to player-hosted relays via a rendezvous server. If codes are short, an attacker can brute-force codes to join games uninvited — griefing lobbies or extracting connection info.

A 4-character alphanumeric code has ~1.7 million combinations. At 1000 requests/second, exhausted in ~28 minutes. Shorter codes are worse.

### Mitigation: Length + Rate Limiting + Expiry

```rust
pub struct JoinCode {
    pub code: String,          // 6-8 chars, alphanumeric, no ambiguous chars (0/O, 1/I/l)
    pub created_at: Instant,
    pub expires_at: Instant,   // TTL: 5 minutes (enough to share, too short to brute-force)
    pub uses_remaining: u32,   // 1 for private, N for party invites
}

impl RendezvousServer {
    fn resolve_code(&mut self, code: &str, requester_ip: IpAddr) -> Result<ConnectionInfo> {
        // Rate limit: max 5 resolve attempts per IP per minute
        if self.rate_limiter.check(requester_ip).is_err() {
            return Err(RateLimited);
        }
        // Lookup and consume
        match self.codes.get(code) {
            Some(entry) if entry.expires_at > Instant::now() => Ok(entry.connection_info()),
            _ => Err(InvalidCode),  // Don't distinguish "expired" from "nonexistent"
        }
    }
}
```

**Key choices:**
- 6+ characters from a 32-char alphabet (no ambiguous chars) = ~1 billion combinations
- Rate limit resolves per IP (5/minute blocks brute-force, legitimate users never hit it)
- Codes expire after 5 minutes (limits attack window)
- Invalid vs expired returns the same error (no information leakage)

## Vulnerability 9: Tracking Server Abuse

### The Problem
The tracking server is a public API. Abuse vectors:
- **Spam listings** — flood with fake games, burying real ones
- **Phishing redirects** — listing points to a malicious IP that mimics a game server but captures client info
- **DDoS** — overwhelm the server to deny game discovery for everyone

OpenRA's master server has been DDoSed before. Any public game directory faces this.

### Mitigation: Standard API Hardening

```rust
pub struct TrackingServerConfig {
    pub max_listings_per_ip: u32,        // 3 — one IP rarely needs more
    pub heartbeat_interval: Duration,    // 30s — listing expires if missed
    pub listing_ttl: Duration,           // 2 minutes without heartbeat → removed
    pub browse_rate_limit: u32,          // 30 requests/minute per IP
    pub publish_rate_limit: u32,         // 5 requests/minute per IP
    pub require_valid_game_port: bool,   // Server verifies the listed port is reachable
}
```

**Spam prevention:** Limit listings per IP. Require heartbeats (real games send them, spam bots must sustain effort). Optionally verify the listed port actually responds to a game protocol handshake.

**Phishing prevention:** Client validates the game protocol handshake before showing the lobby. A non-game server at the listed IP fails handshake and is silently dropped from the browser.

**DDoS:** Standard infrastructure — CDN/reverse proxy for the browse API, rate limiting, geographic distribution. The tracking server is stateless and trivially horizontally scalable (it's just a filtered list in memory).

## Vulnerability 10: Client Version Mismatch

### The Problem
Players with different client versions join the same game. Even minor differences in sim code (bug fix, balance patch) cause immediate desyncs. This looks like a bug to users, destroys trust, and wastes time. Age of Empires 2 DE had years of desync issues partly caused by version mismatches.

### Mitigation: Version Handshake at Connection

```rust
pub struct VersionInfo {
    pub engine_version: SemVer,        // e.g., 0.3.1
    pub sim_hash: u64,                 // hash of compiled sim logic (catches patched binaries)
    pub mod_manifest_hash: u64,        // hash of loaded mod rules (catches different mod versions)
    pub protocol_version: u32,         // wire protocol version
}

impl GameLobby {
    fn accept_player(&self, remote: &VersionInfo) -> Result<()> {
        if remote.protocol_version != self.host.protocol_version {
            return Err(IncompatibleProtocol);
        }
        if remote.sim_hash != self.host.sim_hash {
            return Err(SimVersionMismatch);
        }
        if remote.mod_manifest_hash != self.host.mod_manifest_hash {
            return Err(ModMismatch);
        }
        Ok(())
    }
}
```

**Key:** Check version during lobby join, not after game starts. The relay server and tracking server listings both include `VersionInfo` so incompatible games are filtered from the browser entirely.
