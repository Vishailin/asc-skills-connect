// ASC Skills Connect — Verification provider integration seam
// (spec 5.6 "Qualification & ID Verification"; Section 6 "Verification
// Integration — What's Actually Available").
//
// DHA ID verification and SAQA qualification verification both require
// real accredited-vendor contracts this project doesn't have — per the
// spec's own research, DHA has no direct public API (verification goes
// through a DHA-accredited third-party vendor), and SAQA VeriSearch is a
// contracted service with real turnaround time, not an open API. This
// module is the pluggable seam verification_records.provider was always
// meant to plug a real vendor into — it is NOT a working integration
// with either DHA or SAQA.
//
// The one piece here that's genuinely real, not a stand-in: SA ID number
// format + checksum validation (the Luhn-style check digit every valid
// 13-digit SA ID number satisfies). That's a legitimate first-pass check
// any real system would run before even calling an accredited vendor —
// it can confidently reject a malformed ID, but passing it is NOT proof
// of identity, so it can never resolve a record to 'verified' on its own.

function isValidSaIdChecksum(idNumber) {
  if (!/^\d{13}$/.test(idNumber || "")) return false;
  const digits = idNumber.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let d = digits[i];
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === digits[12];
}

// Real automated pre-check for 'id' records. Never returns 'verified' —
// format validity isn't proof of identity, only a DHA-accredited vendor
// (not integrated here) can actually confirm that.
async function runIdPreCheck(idNumber) {
  if (!isValidSaIdChecksum(idNumber)) {
    return { outcome: "rejected", reason: "ID number fails the standard SA ID checksum — malformed, cannot be a genuine ID number.", auto: true };
  }
  return { outcome: "pending", reason: "Format/checksum valid. Awaiting a DHA-accredited vendor call (not integrated in this build — see README) for actual identity confirmation.", auto: false };
}

// Stub for 'qualification' records — always defers to manual review. A
// real integration would call SAQA VeriSearch here; nothing here does.
async function runQualificationPreCheck() {
  return { outcome: "pending", reason: "SAQA VeriSearch integration not built — requires a signed verification agreement with SAQA (spec section 6). Awaiting manual review.", auto: false };
}

module.exports = { isValidSaIdChecksum, runIdPreCheck, runQualificationPreCheck };
