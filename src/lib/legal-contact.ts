/** Contact email for legal notices (DMCA, 2257, privacy). */
export function legalContactEmail(domain: string): string {
  return (
    process.env.LEGAL_CONTACT_EMAIL ||
    process.env.SMTP_USER?.replace(/^.*<([^>]+)>.*$/, "$1") ||
    process.env.SMTP_USER ||
    `office@${domain}`
  );
}

/** Custodian of Records name for 18 U.S.C. § 2257 (falls back to site operator). */
export function custodianName(siteName: string): string {
  return process.env.LEGAL_CUSTODIAN_NAME || `${siteName} — Custodian of Records`;
}

/** Mailing address where §2257 records are kept (required for compliance pages). */
export function custodianAddress(domain: string, contactEmail: string): string {
  return (
    process.env.LEGAL_CUSTODIAN_ADDRESS ||
    `Records location on file with the operator. Contact ${contactEmail} to obtain the current Custodian of Records mailing address.`
  );
}
