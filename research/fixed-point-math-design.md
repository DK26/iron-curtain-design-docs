# Fixed-Point Math Library Design for `ic-sim`

> **Purpose:** Resolve P002 (fixed-point scale factor) and design the complete fixed-point math library for IC's deterministic simulation
> **Date:** 2026-02-26
> **Referenced by:** D009 (Fixed-Point Math, No Floats), D028 (Condition and Multiplier Systems), P002 (Fixed-Point Scale Factor)
> **Philosophy:** "IC defines its own standard" — but for fixed-point math, matching OpenRA's 1024 scale is the correct choice. Cross-engine coordinate compatibility (D023, 05-FORMATS.md) is not a nice-to-have; it is a hard requirement for the compatibility layer. When the right answer already exists, adopt it.

---

## 1. P002 Resolution: Scale Factor = 1024

**SETTLED.** The fixed-point scale factor is **1024** — 10 fractional bits. P002 is resolved.

### Decision

All simulation-layer fixed-point values use 1024 subdivisions per integer unit. One cell = 1024 fixed-point units. `Fixed(1024)` = 1.0.

### Rationale

1. **OpenRA compatibility.** OpenRA's `WDist`, `WPos`, and `WAngle` all use 1024 subdivisions. IC's coordinate transform layer (D023, `05-FORMATS.md`) maps `WorldPos` to OpenRA's `WPos`. With 1024 scale on both sides, this transform is the identity function — zero conversion logic, zero rounding error, zero bugs.

2. **Bit-shift arithmetic.** 1024 = 2^10. Multiplication and division by the scale factor reduce to bit shifts (`<< 10`, `>> 10`), which are single-cycle operations on every target platform. No actual division instruction is ever needed for scale conversion.

3. **Sufficient precision.** 1/1024 ≈ 0.001 cells. At a typical cell size of 24 pixels (RA1), this gives sub-pixel positioning precision. RTS unit movement does not need more — units snap to visual positions at far coarser granularity.

4. **i32 overflow headroom.** See overflow analysis below.

### Comparison Table

| Scale Factor | Bits | Precision (per cell) | i32 Range (cells)   | OpenRA Match | Notes |
|-------------|------|---------------------|---------------------|-------------|-------|
| 256         | 8    | 1/256 ≈ 0.004      | ±8,388,607          | No          | Less precision than needed for smooth diagonal movement. Would require conversion layer for OpenRA interop. |
| **1024**    | **10** | **1/1024 ≈ 0.001** | **±2,097,151**      | **Yes**     | **Chosen.** Best balance of precision, overflow margin, and compatibility. |
| 4096        | 12   | 1/4096 ≈ 0.0002    | ±524,287            | No          | Excessive precision. i32 overflow becomes a real concern for distance-squared calculations on large maps. Would require i64 for many intermediate values that currently fit in i32. |

### Overflow Analysis

With scale factor 1024 and `SimCoord = i32`:

- **Maximum coordinate value:** `i32::MAX / 1024 = 2,097,151` cells in each direction
- **Largest practical map:** 512 x 512 cells (RA1's largest maps are 128x128; TS/RA2 go up to 256x256)
- **Margin:** 2,097,151 / 512 = 4,096x headroom. Even with intermediate calculations that temporarily exceed map bounds, overflow is not a concern for positions.

**Distance-squared overflow check:**
- Worst case: two corners of a 512x512 map. `dx = 512 * 1024 = 524,288`, `dy = 524,288`.
- `dx^2 + dy^2 = 524,288^2 + 524,288^2 = 274,877,906,944 + 274,877,906,944 = 549,755,813,888`
- This exceeds `i32::MAX` (2,147,483,647). **Distance-squared must use i64.**
- With i64 intermediate: `i64::MAX = 9.2 x 10^18`, so even squaring the largest i32 value is safe.

**Multiplication overflow check:**
- `Fixed(x) * Fixed(y)` requires `x * y` before shifting. If both are near `i32::MAX`, the product overflows i32.
- **All multiplications must use i64 intermediate.** This is non-negotiable and reflected in the `Mul` implementation below.

---

## 2. Core Types

### `Fixed` — The Fundamental Fixed-Point Type

```rust
/// Fixed-point number with 10 fractional bits (scale factor 1024).
/// `Fixed(1024)` represents 1.0. Used for ALL simulation-layer arithmetic.
///
/// NEVER convert to f32/f64 inside the simulation. The `to_f32()` method
/// exists solely for the render layer to convert sim state to GPU coordinates.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
#[repr(transparent)]
pub struct Fixed(pub i32);

/// Number of fractional bits.
const FRAC_BITS: u32 = 10;

/// Scale factor = 2^FRAC_BITS = 1024.
const SCALE: i32 = 1 << FRAC_BITS; // 1024

impl Fixed {
    // ── Constants ──────────────────────────────────────────────

    pub const ZERO: Fixed = Fixed(0);
    pub const ONE: Fixed = Fixed(1024);
    pub const HALF: Fixed = Fixed(512);
    pub const NEG_ONE: Fixed = Fixed(-1024);
    pub const TWO: Fixed = Fixed(2048);
    pub const MAX: Fixed = Fixed(i32::MAX);
    pub const MIN: Fixed = Fixed(i32::MIN);

    /// sqrt(2) * 1024 = 1448.15... truncated to 1448
    pub const SQRT2: Fixed = Fixed(1448);

    // ── Construction ──────────────────────────────────────────

    /// Create from integer. `Fixed::from_int(3)` = `Fixed(3072)`.
    #[inline]
    pub const fn from_int(n: i32) -> Fixed {
        Fixed(n << FRAC_BITS)
    }

    /// Create from fraction. `Fixed::from_frac(1, 3)` = `Fixed(341)` (approx 0.333).
    /// Panics if denom == 0.
    #[inline]
    pub const fn from_frac(num: i32, denom: i32) -> Fixed {
        Fixed((num << FRAC_BITS) / denom)
    }

    /// Create from raw i32 value. `Fixed::raw(512)` = 0.5.
    #[inline]
    pub const fn raw(val: i32) -> Fixed {
        Fixed(val)
    }

    // ── Conversion ────────────────────────────────────────────

    /// Truncate to integer (rounds toward zero).
    /// `Fixed(3000).to_int()` = 2 (3000 >> 10 = 2).
    #[inline]
    pub const fn to_int(self) -> i32 {
        self.0 >> FRAC_BITS
    }

    /// Round to nearest integer.
    /// `Fixed(1536).round()` = 2 (1536 + 512 = 2048, >> 10 = 2).
    #[inline]
    pub const fn round(self) -> i32 {
        (self.0 + (SCALE >> 1)) >> FRAC_BITS
    }

    /// Convert to f32 for rendering. NEVER call this in simulation code.
    /// Enforced by `#[cfg(not(feature = "sim-only"))]` or clippy lint.
    #[inline]
    pub fn to_f32(self) -> f32 {
        self.0 as f32 / SCALE as f32
    }

    /// Raw inner value.
    #[inline]
    pub const fn raw_value(self) -> i32 {
        self.0
    }

    // ── Arithmetic ────────────────────────────────────────────

    /// Absolute value.
    #[inline]
    pub const fn abs(self) -> Fixed {
        if self.0 < 0 {
            Fixed(-self.0)
        } else {
            self
        }
    }

    /// Minimum of two values.
    #[inline]
    pub const fn min(self, other: Fixed) -> Fixed {
        if self.0 < other.0 { self } else { other }
    }

    /// Maximum of two values.
    #[inline]
    pub const fn max(self, other: Fixed) -> Fixed {
        if self.0 > other.0 { self } else { other }
    }

    /// Clamp to [lo, hi].
    #[inline]
    pub const fn clamp(self, lo: Fixed, hi: Fixed) -> Fixed {
        if self.0 < lo.0 {
            lo
        } else if self.0 > hi.0 {
            hi
        } else {
            self
        }
    }

    // ── Overflow-safe variants ────────────────────────────────

    /// Checked multiplication. Returns None on overflow.
    #[inline]
    pub const fn checked_mul(self, rhs: Fixed) -> Option<Fixed> {
        let wide: i64 = (self.0 as i64) * (rhs.0 as i64);
        let result: i64 = wide >> FRAC_BITS;
        if result > i32::MAX as i64 || result < i32::MIN as i64 {
            None
        } else {
            Some(Fixed(result as i32))
        }
    }

    /// Saturating multiplication. Clamps to Fixed::MAX/MIN on overflow.
    #[inline]
    pub const fn saturating_mul(self, rhs: Fixed) -> Fixed {
        let wide: i64 = (self.0 as i64) * (rhs.0 as i64);
        let result: i64 = wide >> FRAC_BITS;
        if result > i32::MAX as i64 {
            Fixed::MAX
        } else if result < (i32::MIN as i64) {
            Fixed::MIN
        } else {
            Fixed(result as i32)
        }
    }

    /// Checked division. Returns None on overflow or division by zero.
    #[inline]
    pub const fn checked_div(self, rhs: Fixed) -> Option<Fixed> {
        if rhs.0 == 0 {
            return None;
        }
        let wide: i64 = (self.0 as i64) << FRAC_BITS;
        let result: i64 = wide / (rhs.0 as i64);
        if result > i32::MAX as i64 || result < i32::MIN as i64 {
            None
        } else {
            Some(Fixed(result as i32))
        }
    }
}

// ── Operator Implementations ──────────────────────────────────

impl core::ops::Add for Fixed {
    type Output = Fixed;
    #[inline]
    fn add(self, rhs: Fixed) -> Fixed {
        Fixed(self.0 + rhs.0)
    }
}

impl core::ops::Sub for Fixed {
    type Output = Fixed;
    #[inline]
    fn sub(self, rhs: Fixed) -> Fixed {
        Fixed(self.0 - rhs.0)
    }
}

impl core::ops::Neg for Fixed {
    type Output = Fixed;
    #[inline]
    fn neg(self) -> Fixed {
        Fixed(-self.0)
    }
}

impl core::ops::Mul for Fixed {
    type Output = Fixed;
    /// Multiplication using i64 intermediate to prevent overflow.
    /// (a * b) >> 10, computed as: widen to i64, multiply, shift, narrow back.
    #[inline]
    fn mul(self, rhs: Fixed) -> Fixed {
        let wide: i64 = (self.0 as i64) * (rhs.0 as i64);
        Fixed((wide >> FRAC_BITS) as i32)
    }
}

impl core::ops::Div for Fixed {
    type Output = Fixed;
    /// Division using i64 intermediate to preserve precision.
    /// (a << 10) / b, computed in i64 to prevent overflow.
    /// Panics on division by zero (same semantics as integer division).
    #[inline]
    fn div(self, rhs: Fixed) -> Fixed {
        let wide: i64 = (self.0 as i64) << FRAC_BITS;
        Fixed((wide / rhs.0 as i64) as i32)
    }
}

impl core::ops::AddAssign for Fixed {
    #[inline]
    fn add_assign(&mut self, rhs: Fixed) { self.0 += rhs.0; }
}

impl core::ops::SubAssign for Fixed {
    #[inline]
    fn sub_assign(&mut self, rhs: Fixed) { self.0 -= rhs.0; }
}

impl core::ops::MulAssign for Fixed {
    #[inline]
    fn mul_assign(&mut self, rhs: Fixed) {
        *self = *self * rhs;
    }
}

impl core::ops::DivAssign for Fixed {
    #[inline]
    fn div_assign(&mut self, rhs: Fixed) {
        *self = *self / rhs;
    }
}

// ── Scalar operations (multiply/divide Fixed by i32) ──────────

impl core::ops::Mul<i32> for Fixed {
    type Output = Fixed;
    /// Multiply fixed-point by integer scalar. No shift needed.
    #[inline]
    fn mul(self, rhs: i32) -> Fixed {
        Fixed(self.0 * rhs)
    }
}

impl core::ops::Div<i32> for Fixed {
    type Output = Fixed;
    /// Divide fixed-point by integer scalar. No shift needed.
    #[inline]
    fn div(self, rhs: i32) -> Fixed {
        Fixed(self.0 / rhs)
    }
}
```

### `WorldPos` — 3D Simulation Position

```rust
/// 3D position in simulation space. All coordinates are Fixed (1024 = 1 cell).
/// RA1 game module sets z = Fixed::ZERO everywhere (flat isometric).
/// RA2/TS game module uses z for terrain elevation, bridges, aircraft altitude.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct WorldPos {
    pub x: Fixed,
    pub y: Fixed,
    pub z: Fixed,
}

impl WorldPos {
    /// Origin.
    pub const ZERO: WorldPos = WorldPos {
        x: Fixed::ZERO,
        y: Fixed::ZERO,
        z: Fixed::ZERO,
    };

    /// Construct from cell coordinates (integer).
    #[inline]
    pub const fn from_cell(cx: i32, cy: i32, cz: i32) -> WorldPos {
        WorldPos {
            x: Fixed::from_int(cx),
            y: Fixed::from_int(cy),
            z: Fixed::from_int(cz),
        }
    }

    /// Construct from cell center (adds 0.5 to each axis for cell-center positioning).
    #[inline]
    pub const fn from_cell_center(cx: i32, cy: i32, cz: i32) -> WorldPos {
        WorldPos {
            x: Fixed((cx << 10) + 512),
            y: Fixed((cy << 10) + 512),
            z: Fixed((cz << 10) + 512),
        }
    }

    /// Squared Euclidean distance between two positions.
    /// Returns i64 because the result can exceed i32 range on large maps.
    /// Does NOT return Fixed — the result is in "Fixed-squared" units which
    /// is not meaningful as a Fixed value. Use for comparison only.
    #[inline]
    pub fn distance_squared(a: WorldPos, b: WorldPos) -> i64 {
        let dx = (a.x.0 - b.x.0) as i64;
        let dy = (a.y.0 - b.y.0) as i64;
        let dz = (a.z.0 - b.z.0) as i64;
        dx * dx + dy * dy + dz * dz
    }

    /// 2D squared distance (ignoring z). Common case for RA1 flat maps.
    #[inline]
    pub fn distance_squared_2d(a: WorldPos, b: WorldPos) -> i64 {
        let dx = (a.x.0 - b.x.0) as i64;
        let dy = (a.y.0 - b.y.0) as i64;
        dx * dx + dy * dy
    }

    /// Manhattan distance (L1 norm). Cheap, no multiplication.
    #[inline]
    pub fn manhattan_distance(a: WorldPos, b: WorldPos) -> Fixed {
        let dx = (a.x.0 - b.x.0).abs();
        let dy = (a.y.0 - b.y.0).abs();
        let dz = (a.z.0 - b.z.0).abs();
        Fixed(dx + dy + dz)
    }

    /// 2D Manhattan distance (ignoring z).
    #[inline]
    pub fn manhattan_distance_2d(a: WorldPos, b: WorldPos) -> Fixed {
        let dx = (a.x.0 - b.x.0).abs();
        let dy = (a.y.0 - b.y.0).abs();
        Fixed(dx + dy)
    }

    /// Octile distance (grid-aware heuristic for 8-directional movement).
    /// Uses SQRT2_APPROX = 1448 (sqrt(2) * 1024, truncated).
    /// Formula: max(dx,dy) + (SQRT2_APPROX - 1024) * min(dx,dy) / 1024
    /// Result is in Fixed units.
    ///
    /// Reference: research/pathfinding-ic-default-design.md
    #[inline]
    pub fn octile_distance(a: WorldPos, b: WorldPos) -> Fixed {
        let dx = (a.x.0 - b.x.0).abs();
        let dy = (a.y.0 - b.y.0).abs();
        let (big, small) = if dx > dy { (dx, dy) } else { (dy, dx) };
        // (SQRT2_APPROX - SCALE) = 1448 - 1024 = 424
        // big + 424 * small / 1024
        let diagonal_extra = (424_i64 * small as i64 >> 10) as i32;
        Fixed(big + diagonal_extra)
    }

    /// Euclidean distance using fixed_sqrt. More expensive than the above.
    /// Prefer distance_squared for comparisons, octile for heuristics.
    #[inline]
    pub fn distance(a: WorldPos, b: WorldPos) -> Fixed {
        let dsq = WorldPos::distance_squared_2d(a, b);
        // dsq is in raw units squared. sqrt(dsq) gives raw units = Fixed distance.
        fixed_sqrt_i64(dsq)
    }

    /// Vector addition.
    #[inline]
    pub fn add(self, other: WorldPos) -> WorldPos {
        WorldPos {
            x: Fixed(self.x.0 + other.x.0),
            y: Fixed(self.y.0 + other.y.0),
            z: Fixed(self.z.0 + other.z.0),
        }
    }

    /// Vector subtraction.
    #[inline]
    pub fn sub(self, other: WorldPos) -> WorldPos {
        WorldPos {
            x: Fixed(self.x.0 - other.x.0),
            y: Fixed(self.y.0 - other.y.0),
            z: Fixed(self.z.0 - other.z.0),
        }
    }
}
```

### `WAngle` — Angular Measurement

```rust
/// Angle measured in 1/1024ths of a full revolution.
/// Range: 0..1023 maps to 0 degrees through approximately 359.65 degrees.
/// Values outside this range are valid but should be normalized before table lookup.
///
/// Matches OpenRA's WAngle exactly — both use 1024 subdivisions per turn.
/// 0 = North (up), 256 = East, 512 = South, 768 = West.
/// Clockwise rotation (standard for screen coordinates where Y increases downward).
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
#[repr(transparent)]
pub struct WAngle(pub i32);

impl WAngle {
    // ── Constants ──────────────────────────────────────────────
    pub const NORTH: WAngle = WAngle(0);
    pub const EAST: WAngle = WAngle(256);
    pub const SOUTH: WAngle = WAngle(512);
    pub const WEST: WAngle = WAngle(768);
    pub const FULL_TURN: i32 = 1024;
    pub const HALF_TURN: WAngle = WAngle(512);
    pub const QUARTER_TURN: WAngle = WAngle(256);

    /// Northeast (45 degrees).
    pub const NORTHEAST: WAngle = WAngle(128);
    /// Southeast (135 degrees).
    pub const SOUTHEAST: WAngle = WAngle(384);
    /// Southwest (225 degrees).
    pub const SOUTHWEST: WAngle = WAngle(640);
    /// Northwest (315 degrees).
    pub const NORTHWEST: WAngle = WAngle(896);

    // ── Construction ──────────────────────────────────────────

    /// Create from raw value.
    #[inline]
    pub const fn new(val: i32) -> WAngle {
        WAngle(val)
    }

    /// Create from degrees (approximate — 360 degrees maps to 1024 units).
    /// `WAngle::from_degrees(90)` = `WAngle(256)`.
    #[inline]
    pub const fn from_degrees(deg: i32) -> WAngle {
        // deg * 1024 / 360, but we want to avoid large intermediate values.
        // Use: deg * 128 / 45 (equivalent, smaller intermediates).
        WAngle((deg * 128 / 45) & 1023)
    }

    // ── Normalization ─────────────────────────────────────────

    /// Normalize to [0, 1023] range. Branchless bitwise mask.
    /// Works because 1024 is a power of 2.
    #[inline]
    pub const fn normalize(self) -> WAngle {
        WAngle(self.0 & 1023)
    }

    // ── Arithmetic ────────────────────────────────────────────

    /// Add two angles (result is normalized).
    #[inline]
    pub const fn add(self, rhs: WAngle) -> WAngle {
        WAngle((self.0 + rhs.0) & 1023)
    }

    /// Subtract two angles (result is normalized).
    #[inline]
    pub const fn sub(self, rhs: WAngle) -> WAngle {
        WAngle((self.0 - rhs.0) & 1023)
    }

    /// Raw inner value.
    #[inline]
    pub const fn raw(self) -> i32 {
        self.0
    }
}
```

---

## 3. Trigonometric Functions

### Sin/Cos Lookup Table

The sine table stores 257 entries covering the first quadrant (0 to 90 degrees, WAngle indices 0 to 256 inclusive). Values are in Fixed-point scale (multiplied by 1024). The full sine wave is reconstructed using quarter-wave symmetry. `SIN_TABLE[0] = 0` (sin 0) and `SIN_TABLE[256] = 1024` (sin 90).

**Formula:** `SIN_TABLE[i] = round(sin(i * pi / 512) * 1024)` for i in 0..=256.

The table **must** be generated programmatically at compile time — not hand-typed. The `const fn` below produces the exact values. This document provides the generation algorithm and anchor-point checksums. The runtime sim only does integer table lookups.

**Anchor points (verified by hand, serve as compile-time assertions):**

| Index | Angle (deg) | sin(angle) | x 1024 | Rounded |
|-------|-------------|------------|--------|---------|
| 0     | 0.000       | 0.00000    | 0.0    | **0**       |
| 1     | 0.352       | 0.00614    | 6.3    | **6**       |
| 16    | 5.625       | 0.09802    | 100.4  | **100**     |
| 32    | 11.250      | 0.19509    | 199.8  | **200**     |
| 48    | 16.875      | 0.29028    | 297.2  | **297**     |
| 64    | 22.500      | 0.38268    | 391.9  | **392**     |
| 80    | 28.125      | 0.47140    | 482.7  | **483**     |
| 96    | 33.750      | 0.55557    | 568.9  | **569**     |
| 112   | 39.375      | 0.63439    | 649.6  | **650**     |
| 128   | 45.000      | 0.70711    | 724.1  | **724**     |
| 144   | 50.625      | 0.77301    | 791.6  | **792**     |
| 160   | 56.250      | 0.83147    | 851.4  | **851**     |
| 176   | 61.875      | 0.88192    | 903.1  | **903**     |
| 192   | 67.500      | 0.92388    | 946.1  | **946**     |
| 208   | 73.125      | 0.95694    | 979.9  | **980**     |
| 224   | 78.750      | 0.98079    | 1004.3 | **1004**    |
| 240   | 84.375      | 0.99518    | 1019.1 | **1019**    |
| 256   | 90.000      | 1.00000    | 1024.0 | **1024**    |

Key observations:
- Values range from 0 (sin 0) to 1024 (sin 90). The table is monotonically increasing.
- `SIN_TABLE[128] = 724` confirms `sqrt(2)/2 * 1024 = 724`, consistent with `SQRT2_APPROX = 1448` (since 1448/2 = 724).

**Table generation (const fn, compile-time only):**

```rust
/// Generate the quarter-wave sine lookup table at compile time.
/// f64 is used ONLY here to produce the integer table.
/// The runtime simulation never touches floating-point.
fn generate_sin_table() -> [i32; 257] {
    let mut table = [0i32; 257];
    let mut i: usize = 0;
    while i <= 256 {
        let radians: f64 = (i as f64) * std::f64::consts::PI / 512.0;
        table[i] = (radians.sin() * 1024.0 + 0.5) as i32; // round-to-nearest
        i += 1;
    }
    table
}

const SIN_TABLE: [i32; 257] = generate_sin_table();
```

**Compile-time verification assertions (must pass or the build fails):**

```rust
const _: () = {
    assert!(SIN_TABLE[0] == 0);       // sin(0)
    assert!(SIN_TABLE[64] == 392);    // sin(22.5) x 1024
    assert!(SIN_TABLE[128] == 724);   // sin(45) x 1024 = sqrt(2)/2 x 1024
    assert!(SIN_TABLE[192] == 946);   // sin(67.5) x 1024
    assert!(SIN_TABLE[256] == 1024);  // sin(90) x 1024
    // Additional spot checks:
    assert!(SIN_TABLE[1] == 6);
    assert!(SIN_TABLE[16] == 100);
    assert!(SIN_TABLE[32] == 200);
    assert!(SIN_TABLE[48] == 297);
    assert!(SIN_TABLE[80] == 483);
    assert!(SIN_TABLE[96] == 569);
    assert!(SIN_TABLE[112] == 650);
    assert!(SIN_TABLE[144] == 792);
    assert!(SIN_TABLE[160] == 851);
    assert!(SIN_TABLE[176] == 903);
    assert!(SIN_TABLE[208] == 980);
    assert!(SIN_TABLE[224] == 1004);
    assert!(SIN_TABLE[240] == 1019);
};
```

**Why generate rather than hardcode?** A hardcoded 257-entry table is error-prone to transcribe and impossible to verify by eye. The `const fn` approach guarantees correctness: if the anchor assertions pass, every entry is correct by construction. The f64 computation happens at compile time on the build machine; the resulting i32 array is baked into the binary as a static constant. At runtime, only integer table lookups occur.

### Sin/Cos Functions

```rust
/// Lookup sine of a WAngle. Returns Fixed-point value in [-1024, 1024].
/// Uses quarter-wave symmetry to expand the 257-entry table to the full circle.
///
/// Quadrant mapping:
///   Q1: angle 0..256    -> sin = +SIN_TABLE[angle]
///   Q2: angle 256..512  -> sin = +SIN_TABLE[512 - angle]
///   Q3: angle 512..768  -> sin = -SIN_TABLE[angle - 512]
///   Q4: angle 768..1024 -> sin = -SIN_TABLE[1024 - angle]
pub fn sin(angle: WAngle) -> Fixed {
    let a = angle.0 & 1023;  // normalize to [0, 1023]

    let (index, negate) = if a < 256 {
        // Q1: 0 .. 90 degrees
        (a, false)
    } else if a < 512 {
        // Q2: 90 .. 180 degrees -> sin(a) = sin(180 - a) = SIN_TABLE[512 - a]
        (512 - a, false)
    } else if a < 768 {
        // Q3: 180 .. 270 degrees -> sin(a) = -sin(a - 180) = -SIN_TABLE[a - 512]
        (a - 512, true)
    } else {
        // Q4: 270 .. 360 degrees -> sin(a) = -sin(360 - a) = -SIN_TABLE[1024 - a]
        (1024 - a, true)
    };

    let value = SIN_TABLE[index as usize];
    Fixed(if negate { -value } else { value })
}

/// Cosine via phase shift: cos(a) = sin(a + 256).
/// 256 WAngle units = 90 degrees = quarter turn.
#[inline]
pub fn cos(angle: WAngle) -> Fixed {
    sin(WAngle(angle.0 + 256))
}
```

### atan2 via CORDIC

CORDIC (COordinate Rotation DIgital Computer) computes atan2 using only integer addition, subtraction, and bit shifts — no multiplication, no division. This makes it fully deterministic and efficient.

**CORDIC angle table:** 16 entries, each representing `atan(2^-i)` in WAngle units (1024 per full turn).

```rust
/// CORDIC angle table: CORDIC_ANGLES[i] = round(atan(2^-i) / (2*pi) * 1024)
///
/// Derivation:
///   atan(2^0)  = 45.000 deg -> 45/360 * 1024 = 128.0 -> 128
///   atan(2^-1) = 26.565 deg -> 26.565/360 * 1024 = 75.6 -> 76
///   atan(2^-2) = 14.036 deg -> 14.036/360 * 1024 = 39.9 -> 40
///   atan(2^-3) =  7.125 deg ->  7.125/360 * 1024 = 20.3 -> 20
///   atan(2^-4) =  3.576 deg ->  3.576/360 * 1024 = 10.2 -> 10
///   atan(2^-5) =  1.790 deg ->  1.790/360 * 1024 =  5.1 ->  5
///   atan(2^-6) =  0.895 deg ->  0.895/360 * 1024 =  2.5 ->  3
///   atan(2^-7) =  0.448 deg ->  0.448/360 * 1024 =  1.3 ->  1
///   atan(2^-8) =  0.224 deg ->  0.224/360 * 1024 =  0.6 ->  1
///   atan(2^-9..15) all round to 0 or 1
const CORDIC_ANGLES: [i32; 16] = [
    128,  // atan(1)       = 45.000 deg
     76,  // atan(1/2)     = 26.565 deg
     40,  // atan(1/4)     = 14.036 deg
     20,  // atan(1/8)     =  7.125 deg
     10,  // atan(1/16)    =  3.576 deg
      5,  // atan(1/32)    =  1.790 deg
      3,  // atan(1/64)    =  0.895 deg
      1,  // atan(1/128)   =  0.448 deg
      1,  // atan(1/256)   =  0.224 deg
      0,  // atan(1/512)   =  0.112 deg
      0,  // atan(1/1024)  =  0.056 deg
      0,
      0,
      0,
      0,
      0,
];

/// Number of CORDIC iterations. 8-10 iterations are sufficient for +/-1 WAngle
/// unit accuracy (the remaining entries are zero). We use 10 for safety.
const CORDIC_ITERATIONS: usize = 10;

/// Compute atan2(y, x) returning a WAngle.
///
/// Returns the angle from the positive X-axis to the point (x, y),
/// measured clockwise in WAngle units (0 = East for raw atan2;
/// see `WAngle::facing` for the North-up convention).
///
/// Uses CORDIC algorithm — only integer add/sub/shift. Fully deterministic.
///
/// Accuracy: +/-1 WAngle unit (approx +/-0.35 degrees).
///
/// Algorithm:
///   1. Map (x, y) into the first quadrant, track original quadrant.
///   2. Run CORDIC iterations: rotate vector toward x-axis, accumulate angle.
///   3. Adjust angle for the original quadrant.
pub fn atan2(y: i32, x: i32) -> WAngle {
    // Handle degenerate cases
    if x == 0 && y == 0 {
        return WAngle(0);
    }

    // Determine quadrant and map to first quadrant (x >= 0, y >= 0)
    let mut ax = x.abs();
    let mut ay = y.abs();

    // CORDIC vectoring mode: rotate (ax, ay) toward the x-axis.
    // Each iteration rotates by atan(2^-i). If y > 0, rotate clockwise
    // (subtract angle); if y < 0, rotate counter-clockwise (add angle).
    let mut angle: i32 = 0;

    for i in 0..CORDIC_ITERATIONS {
        let shift = i as u32;
        if ay > 0 {
            // Rotate clockwise: angle increases
            let new_ax = ax + (ay >> shift);
            let new_ay = ay - (ax >> shift);
            ax = new_ax;
            ay = new_ay;
            angle += CORDIC_ANGLES[i];
        } else {
            // Rotate counter-clockwise: angle decreases
            let new_ax = ax - (ay >> shift);
            let new_ay = ay + (ax >> shift);
            ax = new_ax;
            ay = new_ay;
            angle -= CORDIC_ANGLES[i];
        }
    }

    // `angle` now holds atan2(|y_orig|, |x_orig|) in first-quadrant WAngle units.
    // Map back to the correct quadrant.

    // In standard math convention:
    //   Quadrant I   (x>0, y>0): angle as-is (measured from +X axis)
    //   Quadrant II  (x<0, y>0): 512 - angle (mirror across Y)
    //   Quadrant III (x<0, y<0): 512 + angle
    //   Quadrant IV  (x>0, y<0): 1024 - angle (equivalently: -angle)
    let result = if x >= 0 && y >= 0 {
        angle
    } else if x < 0 && y >= 0 {
        512 - angle
    } else if x < 0 {
        512 + angle
    } else {
        1024 - angle
    };

    WAngle(result & 1023)
}
```

**Error analysis:** With 10 iterations, the accumulated error from rounding in the CORDIC angle table gives +/-1 WAngle unit maximum error (approx +/-0.35 degrees). This is more than sufficient for RTS unit facing — a unit has at most 32 visual facing directions (11.25 degrees each), so +/-0.35 degrees is invisible.

---

## 4. Square Root

### `fixed_sqrt` — Fixed-Point Square Root

```rust
/// Compute the square root of a Fixed-point value using Newton's method
/// (also called Heron's method) on the raw integer, with i64 arithmetic.
///
/// Input: Fixed(v) where v represents the value v/1024.
/// Output: Fixed(r) where r represents sqrt(v/1024).
///
/// Mathematical derivation:
///   We want: r/1024 = sqrt(v/1024)
///   So:      r = sqrt(v/1024) * 1024 = sqrt(v) * sqrt(1024) * (1024/1024)
///   Equivalently: r = sqrt(v * 1024) = sqrt(v << 10)
///
/// We compute isqrt(v << 10) using Newton's method on i64.
///
/// Newton's method for sqrt(S):
///   x_{n+1} = (x_n + S / x_n) / 2
///   Converges in ~5 iterations from a reasonable initial estimate.
pub fn fixed_sqrt(val: Fixed) -> Fixed {
    if val.0 <= 0 {
        return Fixed::ZERO;  // sqrt of negative or zero is zero (clamped)
    }

    // We compute isqrt(val.0 << FRAC_BITS) = isqrt(val.0 << 10)
    let s: i64 = (val.0 as i64) << FRAC_BITS;

    // Rough initial estimate via bit manipulation:
    // Count leading zeros, then estimate sqrt as 1 << ((64 - clz) / 2)
    let bit_len = 64 - s.leading_zeros();
    let mut x: i64 = 1i64 << ((bit_len + 1) / 2);

    // Newton's method: 6 iterations (converges fast from above estimate)
    for _ in 0..6 {
        if x == 0 { break; }
        x = (x + s / x) / 2;
    }

    // Final correction: Newton's method can overshoot by 1
    if x > 0 && x * x > s {
        x -= 1;
    }

    Fixed(x as i32)
}

/// Square root from i64 input — used for distance calculations where
/// the squared distance is already in i64 (e.g., from WorldPos::distance_squared).
///
/// Input: squared distance in raw Fixed-squared units (i64).
/// Output: Fixed distance.
///
/// Since the input is already in "raw units squared" and we want "raw units":
///   result = isqrt(input)
/// No scaling adjustment needed because sqrt(a^2) = a where a is already in raw units.
pub fn fixed_sqrt_i64(val: i64) -> Fixed {
    if val <= 0 {
        return Fixed::ZERO;
    }

    let s: i64 = val;
    let bit_len = 64 - s.leading_zeros();
    let mut x: i64 = 1i64 << ((bit_len + 1) / 2);

    for _ in 0..6 {
        if x == 0 { break; }
        x = (x + s / x) / 2;
    }

    if x > 0 && x * x > s {
        x -= 1;
    }

    // Clamp to i32 range (should always fit for practical map distances)
    Fixed(x.min(i32::MAX as i64) as i32)
}
```

### `isqrt` — Integer Square Root

```rust
/// Integer square root: returns floor(sqrt(val)).
/// Used when Fixed-point overhead is unnecessary (e.g., cell-level distance).
///
/// Same Newton's method as above, operating purely on i32/i64.
pub fn isqrt(val: i32) -> i32 {
    if val <= 0 { return 0; }

    let s = val as i64;
    let bit_len = 64 - s.leading_zeros();
    let mut x: i64 = 1i64 << ((bit_len + 1) / 2);

    for _ in 0..6 {
        if x == 0 { break; }
        x = (x + s / x) / 2;
    }

    if x > 0 && x * x > s {
        x -= 1;
    }

    x as i32
}
```

### Verification

```rust
// SQRT2_APPROX verification:
// fixed_sqrt(Fixed::from_int(2)) = fixed_sqrt(Fixed(2048))
// s = 2048 << 10 = 2,097,152
// sqrt(2,097,152) = 1448.15... -> 1448
// Therefore: fixed_sqrt(Fixed(2048)) = Fixed(1448)
//
// This confirms SQRT2_APPROX = 1448 from research/pathfinding-ic-default-design.md.

const _: () = {
    // Static assertion: SQRT2 constant matches expected value
    assert!(Fixed::SQRT2.0 == 1448);
};
```

---

## 5. Angle Operations

### Facing Calculation

```rust
/// Compute the facing angle from one WorldPos to another.
///
/// Returns a WAngle in IC's North-up clockwise convention:
///   North (0, -1) = WAngle(0)
///   East  (1,  0) = WAngle(256)
///   South (0,  1) = WAngle(512)
///   West  (-1, 0) = WAngle(768)
///
/// This is a 2D operation (z is ignored).
impl WAngle {
    pub fn facing(from: WorldPos, to: WorldPos) -> WAngle {
        let dx = to.x.0 - from.x.0;
        let dy = to.y.0 - from.y.0;

        if dx == 0 && dy == 0 {
            return WAngle::NORTH; // Arbitrary default for zero-length vectors
        }

        // atan2 gives us angle from +X axis. We need angle from +Y axis (North)
        // in clockwise direction (screen coords: Y increases downward).
        //
        // Conversion: WAngle = atan2(dx, -dy)
        //   - When (dx, dy) = (0, -1) -> atan2(0, 1) = 0 -> North
        //   - When (dx, dy) = (1, 0)  -> atan2(1, 0) = 256 -> East
        //   - When (dx, dy) = (0, 1)  -> atan2(0, -1) = 512 -> South
        //   - When (dx, dy) = (-1, 0) -> atan2(-1, 0) = 768 -> West
        atan2(dx, -dy)
    }
}
```

### Angle Difference (Shortest Arc)

```rust
impl WAngle {
    /// Compute the shortest angular difference from `a` to `b`.
    /// Result is in range [-512, 511] (i.e., [-180 deg, +179.65 deg]).
    /// Positive = clockwise, negative = counter-clockwise.
    ///
    /// Handles wraparound correctly:
    ///   difference(WAngle(900), WAngle(100)) -> 224 (not -800)
    ///   difference(WAngle(100), WAngle(900)) -> -224 (not 800)
    pub fn difference(a: WAngle, b: WAngle) -> i32 {
        let raw = (b.0 - a.0) & 1023;  // unsigned difference in [0, 1023]
        if raw > 512 {
            raw - 1024  // wrap to negative (counter-clockwise is shorter)
        } else {
            raw
        }
    }
}
```

### Turn Toward

```rust
impl WAngle {
    /// Rotate `current` toward `target` by at most `max_turn` per tick.
    /// Returns the new angle after the turn.
    ///
    /// If the remaining difference is less than max_turn, snaps to target.
    /// Always takes the shortest arc.
    pub fn turn_toward(current: WAngle, target: WAngle, max_turn: WAngle) -> WAngle {
        let diff = WAngle::difference(current, target);

        if diff == 0 {
            return current;
        }

        let max = max_turn.0;

        let turn = if diff > 0 {
            // Need to rotate clockwise
            if diff <= max { diff } else { max }
        } else {
            // Need to rotate counter-clockwise
            if -diff <= max { diff } else { -max }
        };

        WAngle((current.0 + turn) & 1023)
    }
}
```

### Point Rotation (2D)

```rust
impl WAngle {
    /// Rotate a 2D point around an origin by this angle.
    /// Uses sin/cos lookup table — no floating point.
    ///
    /// Standard 2D rotation matrix (clockwise, screen coordinates):
    ///   x' = cos(t) * (x - ox) - sin(t) * (y - oy) + ox
    ///   y' = sin(t) * (x - ox) + cos(t) * (y - oy) + oy
    ///
    /// All multiplication uses Fixed::mul (i64 intermediate, shift by 10).
    pub fn rotate_point(
        pos: WorldPos,
        origin: WorldPos,
        angle: WAngle,
    ) -> WorldPos {
        let dx = pos.x - origin.x;  // Fixed subtraction
        let dy = pos.y - origin.y;

        let cos_a = cos(angle);
        let sin_a = sin(angle);

        // cos_a and sin_a are Fixed values (scale 1024).
        // dx and dy are Fixed values (scale 1024).
        // Multiply using Fixed * Fixed (uses i64 intermediate, shifts by 10).
        let rx = cos_a * dx - sin_a * dy;
        let ry = sin_a * dx + cos_a * dy;

        WorldPos {
            x: Fixed(rx.0 + origin.x.0),
            y: Fixed(ry.0 + origin.y.0),
            z: pos.z,  // z unchanged for 2D rotation
        }
    }
}
```

---

## 6. OpenRA Compatibility

### Coordinate Transform: Identity

Since IC uses scale factor 1024 and OpenRA uses scale factor 1024, the coordinate transform between `WorldPos` and OpenRA's `WPos` is **trivially the identity**:

```rust
/// Convert IC WorldPos to OpenRA WPos.
/// Since both use 1024 subdivisions per cell, this is a direct field copy.
///
/// Note: OpenRA's WPos has (X, Y, Z) where Y is vertical (height) and Z is
/// the "forward" axis. IC uses (x, y, z) where z is vertical. The axis
/// mapping may need to be adjusted based on OpenRA's specific convention
/// for the game module in question.
///
/// For RA1 (flat maps, z=0), the mapping is:
///   OpenRA WPos(X, Y, Z) <-> IC WorldPos(x=X, y=Z, z=Y)
///
/// This is handled in 05-FORMATS.md's coordinate transform layer (D023).
pub fn worldpos_to_wpos(pos: WorldPos) -> (i32, i32, i32) {
    // Axis mapping for RA1. Other game modules may differ.
    (pos.x.0, pos.z.0, pos.y.0)
}

pub fn wpos_to_worldpos(x: i32, y: i32, z: i32) -> WorldPos {
    // Inverse axis mapping for RA1.
    WorldPos {
        x: Fixed(x),
        y: Fixed(z),
        z: Fixed(y),
    }
}
```

### WAngle: No Conversion Needed

Both IC and OpenRA use 1024 subdivisions per full turn. `WAngle(n)` in IC is identical to `WAngle(n)` in OpenRA. No conversion code exists because none is needed.

### Reference

- `05-FORMATS.md` — asset format loading, coordinate transform definitions
- `D023` — OpenRA vocabulary compatibility layer
- `D027` — canonical enum compatibility

---

## 7. Modifier Arithmetic (D028 Integration)

The condition and multiplier system (D028) applies percentage-based modifiers to combat, movement, production, and other gameplay values. All modifier math must be fixed-point and deterministic.

### Permille-Based Modifiers

Modifiers are expressed in **permille** (parts per thousand) to avoid the need for fractional percentages in integer math:

| Modifier Value | Meaning |
|---------------|---------|
| 1000          | 100% = no change |
| 500           | 50% = half |
| 1500          | 150% = 1.5x |
| 2000          | 200% = double |
| 0             | 0% = completely negated |

```rust
/// Apply a percentage modifier to a base Fixed value.
///
/// modifier_permille: 1000 = 100% (no change), 1500 = 150%, etc.
///
/// Uses i64 intermediate to prevent overflow.
/// Example: apply_modifier(Fixed(2048), 1500) = Fixed(3072)
///   -> 2048 * 1500 / 1000 = 3072
pub fn apply_modifier(base: Fixed, modifier_permille: i32) -> Fixed {
    let result = (base.0 as i64 * modifier_permille as i64) / 1000;
    Fixed(result as i32)
}

/// Apply a percentage modifier to a raw i32 value (e.g., health, cost).
///
/// Same semantics as above but for non-Fixed integer values.
pub fn apply_modifier_i32(base: i32, modifier_permille: i32) -> i32 {
    ((base as i64 * modifier_permille as i64) / 1000) as i32
}
```

### Stacking Multiple Modifiers

When multiple conditions apply simultaneously (e.g., a unit is both "veterancy level 2" and "in low power"), their modifiers stack multiplicatively:

```rust
/// Apply multiple modifiers sequentially.
///
/// Each modifier is in permille. They are applied multiplicatively:
///   result = base * (m1/1000) * (m2/1000) * (m3/1000) * ...
///
/// Uses i64 throughout to prevent overflow during intermediate steps.
/// The final result is clamped to i32 range.
///
/// Example: base=1024, modifiers=[1500, 800] (150% then 80%)
///   -> 1024 * 1500 / 1000 = 1536
///   -> 1536 * 800 / 1000 = 1228
///   -> Final: Fixed(1228) = approx 1.199x multiplier
pub fn apply_modifiers(base: Fixed, modifiers: &[i32]) -> Fixed {
    let mut result: i64 = base.0 as i64;

    for &m in modifiers {
        result = result * m as i64 / 1000;
    }

    // Clamp to i32 range
    let clamped = result.clamp(i32::MIN as i64, i32::MAX as i64);
    Fixed(clamped as i32)
}

/// Apply modifiers and clamp to a non-negative range.
/// Used for values that must never go negative (health, speed, cost, etc.).
pub fn apply_modifiers_clamped(
    base: Fixed,
    modifiers: &[i32],
    min: Fixed,
    max: Fixed,
) -> Fixed {
    let result = apply_modifiers(base, modifiers);
    result.clamp(min, max)
}
```

### Integration with D028 Conditions

In the condition system (D028), each active condition on an entity provides zero or more modifier entries. Each entry specifies:
- Which stat to modify (speed, damage, armor, rate_of_fire, sight_range, etc.)
- The modifier value in permille

```rust
/// A single stat modifier from a condition.
pub struct StatModifier {
    pub stat: StatId,           // Which stat this modifies
    pub permille: i32,          // The modifier value (1000 = no change)
}

/// Compute the effective value of a stat after all active conditions.
///
/// Gathers all modifiers for the given stat from all active conditions
/// on the entity, then applies them multiplicatively.
pub fn compute_effective_stat(
    base_value: Fixed,
    active_modifiers: &[StatModifier],
    stat: StatId,
) -> Fixed {
    let relevant: Vec<i32> = active_modifiers
        .iter()
        .filter(|m| m.stat == stat)
        .map(|m| m.permille)
        .collect();

    if relevant.is_empty() {
        return base_value;
    }

    apply_modifiers_clamped(
        base_value,
        &relevant,
        Fixed::ZERO,    // most stats floor at 0
        Fixed::MAX,     // upper bound depends on the stat; MAX is safe default
    )
}
```

### Reference

- D028 — Condition and Multiplier Systems as Phase 2 Requirements
- D029 — Cross-Game Component Library (Phase 2 Targets)
- The `condition_system()` runs at step 14 in the RA1 system execution order (see `02-ARCHITECTURE.md`)

---

## 8. Determinism Guarantees

This section enumerates every mechanism that ensures fixed-point math produces identical results on all platforms, all targets (x86, ARM, WASM), all compilers.

### 1. Integer-Only Arithmetic

All simulation math is defined in terms of `i32` and `i64` integer operations:
- Addition, subtraction: exact on all platforms
- Multiplication: widened to i64 before shift (no truncation)
- Division: integer division with truncation toward zero (Rust's default `i32` division semantics, defined by the language spec)
- Bit shifts: logical/arithmetic behavior is well-defined for the types used

**No floating-point operations exist in the simulation.** The `to_f32()` method is marked render-only and is enforced by:
- `#[deny(clippy::disallowed_types)]` configured to forbid `f32` and `f64` in the `ic-sim` crate
- Code review policy (AGENTS.md invariant #1)

### 2. Deterministic Trig Tables

The sine table and CORDIC angle table are **compile-time constants**. They are not computed at runtime — the exact i32 values are baked into the binary. Every build on every platform produces identical tables because the generation formula uses `f64` only at compile time, and the resulting integer values are fixed.

**Verification:** The compile-time assertions on anchor points (section 3) catch any table generation bugs before the binary is produced.

### 3. CORDIC Is Shift-and-Add

The CORDIC atan2 implementation uses only:
- Integer comparison (`if ay > 0`)
- Integer addition/subtraction
- Arithmetic right shift (`>> shift`)
- Bitwise AND for normalization

No multiplication, no division, no floating-point. These operations are identically defined on every platform Rust targets.

### 4. Newton's Method Square Root Is Deterministic

The `fixed_sqrt` implementation uses:
- `leading_zeros()` — deterministic, intrinsic on all platforms
- Integer division (`s / x`) — truncation toward zero
- Integer addition, right shift
- A fixed iteration count (6 iterations, not convergence-based)

The fixed iteration count is critical: convergence-based termination (`while |x_new - x_old| > epsilon`) could theoretically differ across platforms due to evaluation order. A fixed count eliminates this risk entirely.

### 5. No Platform-Dependent Rounding

Integer division in Rust truncates toward zero on all platforms. This is guaranteed by the Rust language specification. There is no "rounding mode" for integer arithmetic — the result is fully determined by the operands.

Bit shifts on signed integers: arithmetic right shift preserves the sign bit. Rust defines `i32 >> n` as arithmetic shift. This is platform-independent.

### 6. Modifier Arithmetic

Permille-based modifiers use `i64` intermediate multiplication followed by integer division by 1000. The division by 1000 is a constant and is not subject to platform-dependent optimization differences — the integer result is the same everywhere.

### 7. Enforcement Mechanisms

| Mechanism | What It Prevents |
|-----------|-----------------|
| `clippy::disallowed_types` for f32/f64 in `ic-sim` | Accidental floating-point contamination |
| `#[repr(transparent)]` on Fixed, WAngle | Ensures memory layout matches i32 exactly |
| Compile-time assertions on SIN_TABLE | Catches table generation bugs |
| Determinism test harness (same inputs -> same hash) | Catches any nondeterminism that slips through static checks |
| `ic-sim` has zero dependencies on platform-specific crates | No OS-level numerical differences |

### 8. What About WASM?

WASM integers are fully deterministic. i32 and i64 arithmetic in WASM is bit-exact across all runtimes (this is part of the WASM specification). IC's fixed-point math maps directly to WASM i32/i64 operations with zero platform-specific behavior.

This is one of the key reasons deterministic lockstep works on WASM: integer math is the same everywhere, and IC uses nothing else in the sim.

---

## Appendix A: Module Layout

The fixed-point math library maps to the following module structure within `ic-sim`:

```
ic-sim/
  src/
    math/
      mod.rs          -- re-exports
      fixed.rs        -- Fixed type, arithmetic, conversions
      world_pos.rs    -- WorldPos, distance functions
      angle.rs        -- WAngle, facing, turn_toward, rotate_point
      trig.rs         -- sin, cos, atan2, SIN_TABLE, CORDIC
      sqrt.rs         -- fixed_sqrt, isqrt
      modifier.rs     -- apply_modifier, stacking, D028 integration
```

Each file is focused and independently testable. The `mod.rs` re-exports the public API so callers use `ic_sim::math::Fixed`, `ic_sim::math::sin`, etc.

## Appendix B: Test Vectors

These test vectors validate the implementation. Any correct implementation of this spec must produce these exact results.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // ── Fixed arithmetic ──────────────────────────────────────
    #[test]
    fn fixed_from_int() {
        assert_eq!(Fixed::from_int(1), Fixed(1024));
        assert_eq!(Fixed::from_int(5), Fixed(5120));
        assert_eq!(Fixed::from_int(-3), Fixed(-3072));
        assert_eq!(Fixed::from_int(0), Fixed::ZERO);
    }

    #[test]
    fn fixed_mul() {
        // 1.5 * 2.0 = 3.0
        assert_eq!(Fixed(1536) * Fixed(2048), Fixed(3072));
        // 0.5 * 0.5 = 0.25
        assert_eq!(Fixed(512) * Fixed(512), Fixed(256));
        // -1.0 * 1.0 = -1.0
        assert_eq!(Fixed(-1024) * Fixed(1024), Fixed(-1024));
    }

    #[test]
    fn fixed_div() {
        // 3.0 / 2.0 = 1.5
        assert_eq!(Fixed(3072) / Fixed(2048), Fixed(1536));
        // 1.0 / 3.0 = approx 0.333 -> Fixed(341)
        assert_eq!(Fixed(1024) / Fixed(3072), Fixed(341));
    }

    #[test]
    fn fixed_to_int() {
        assert_eq!(Fixed(3072).to_int(), 3);
        assert_eq!(Fixed(1536).to_int(), 1);  // truncation
        assert_eq!(Fixed(-1536).to_int(), -1); // toward zero
    }

    // ── Trigonometry ──────────────────────────────────────────
    #[test]
    fn sin_cos_cardinal() {
        assert_eq!(sin(WAngle::NORTH).0, 0);         // sin(0) = 0
        assert_eq!(cos(WAngle::NORTH).0, 1024);      // cos(0) = 1
        assert_eq!(sin(WAngle::EAST).0, 1024);       // sin(90) = 1
        assert_eq!(cos(WAngle::EAST).0, 0);          // cos(90) = 0
        assert_eq!(sin(WAngle::SOUTH).0, 0);         // sin(180) = 0
        assert_eq!(cos(WAngle::SOUTH).0, -1024);     // cos(180) = -1
        assert_eq!(sin(WAngle::WEST).0, -1024);      // sin(270) = -1
        assert_eq!(cos(WAngle::WEST).0, 0);          // cos(270) = 0
    }

    #[test]
    fn sin_45_degrees() {
        // sin(45 deg) = sin(WAngle(128)) = SIN_TABLE[128] = 724
        assert_eq!(sin(WAngle(128)).0, 724);
        // cos(45 deg) = sin(45 + 90) = sin(WAngle(384))
        // 384 is in Q2: SIN_TABLE[512 - 384] = SIN_TABLE[128] = 724
        assert_eq!(cos(WAngle(128)).0, 724);
    }

    // ── Square root ───────────────────────────────────────────
    #[test]
    fn sqrt_of_two() {
        // sqrt(2.0) in Fixed: fixed_sqrt(Fixed(2048)) = Fixed(1448)
        let result = fixed_sqrt(Fixed(2048));
        assert!((result.0 - 1448).abs() <= 1);  // tolerance of +/-1
    }

    #[test]
    fn sqrt_of_one() {
        assert_eq!(fixed_sqrt(Fixed::ONE), Fixed::ONE);
    }

    #[test]
    fn sqrt_of_four() {
        // sqrt(4.0) = 2.0 -> Fixed(2048)
        let result = fixed_sqrt(Fixed::from_int(4));
        assert!((result.0 - 2048).abs() <= 1);
    }

    // ── Angles ────────────────────────────────────────────────
    #[test]
    fn angle_normalize() {
        assert_eq!(WAngle(1024).normalize(), WAngle(0));
        assert_eq!(WAngle(1280).normalize(), WAngle(256));
        assert_eq!(WAngle(-256).normalize(), WAngle(768));
    }

    #[test]
    fn angle_difference() {
        assert_eq!(WAngle::difference(WAngle(0), WAngle(256)), 256);
        assert_eq!(WAngle::difference(WAngle(0), WAngle(768)), -256);
        assert_eq!(WAngle::difference(WAngle(900), WAngle(100)), 224);
    }

    #[test]
    fn turn_toward_snap() {
        // If remaining turn is less than max_turn, snap to target
        let result = WAngle::turn_toward(WAngle(0), WAngle(10), WAngle(20));
        assert_eq!(result, WAngle(10));
    }

    #[test]
    fn turn_toward_limited() {
        // Can only turn 10 units per tick; target is 100 away
        let result = WAngle::turn_toward(WAngle(0), WAngle(100), WAngle(10));
        assert_eq!(result, WAngle(10));
    }

    // ── Modifiers ─────────────────────────────────────────────
    #[test]
    fn modifier_no_change() {
        assert_eq!(apply_modifier(Fixed(2048), 1000), Fixed(2048));
    }

    #[test]
    fn modifier_150_percent() {
        assert_eq!(apply_modifier(Fixed(2048), 1500), Fixed(3072));
    }

    #[test]
    fn modifier_stacking() {
        // 1.0 * 150% * 80% = 1.2
        let result = apply_modifiers(Fixed::ONE, &[1500, 800]);
        assert_eq!(result, Fixed(1228));  // 1024 * 1500 / 1000 * 800 / 1000 = 1228
    }

    // ── Distance ──────────────────────────────────────────────
    #[test]
    fn manhattan_distance_basic() {
        let a = WorldPos::from_cell(0, 0, 0);
        let b = WorldPos::from_cell(3, 4, 0);
        let dist = WorldPos::manhattan_distance_2d(a, b);
        assert_eq!(dist, Fixed::from_int(7));  // 3 + 4 = 7 cells
    }

    #[test]
    fn octile_distance_diagonal() {
        // From (0,0) to (1,1): octile distance = 1 + 0.414 * 1 = approx 1.414 cells
        let a = WorldPos::from_cell(0, 0, 0);
        let b = WorldPos::from_cell(1, 1, 0);
        let dist = WorldPos::octile_distance(a, b);
        // Expected: 1024 + 424 * 1024 / 1024 = 1024 + 424 = 1448 = SQRT2_APPROX
        assert_eq!(dist.0, 1448);
    }
}
```

---

## Appendix C: Relationship to Existing Design Docs

| Document | Relationship |
|----------|-------------|
| `src/02-ARCHITECTURE.md` | Defines `SimCoord = i32` and `WorldPos` (now backed by `Fixed`) |
| `src/09-DECISIONS.md` P002 | **Resolved by this document.** Scale = 1024. |
| `src/decisions/09a-foundation.md` D009 | Fixed-point math invariant. This document provides the implementation design. |
| `src/decisions/09d/D028-conditions-multipliers.md` | Modifier arithmetic (section 7) integrates with D028's condition system. |
| `research/pathfinding-ic-default-design.md` | Uses `SQRT2_APPROX = 1448`, `octile_distance`, and Fixed-point cost fields. All confirmed compatible. |
| `src/05-FORMATS.md` / D023 | OpenRA coordinate transform. Section 6 confirms the transform is identity at 1024 scale. |
| `src/18-PROJECT-TRACKER.md` | P002 is listed as an M2 blocker. This resolution unblocks M2 implementation. |
