/** Monitored studio inbox. Legal pages and the contact form on sharlila.com use this address. */
export const SHARLILA_CONTACT_EMAIL = "contact@sharlila.com";

/** Address shown on the site so visitors can write to that site. */
export function siteContactEmail(domain: string): string {
  const host = domain.trim().toLowerCase().replace(/^www\./, "");
  if (host === "sharlila.com") return SHARLILA_CONTACT_EMAIL;
  return `admin@${host}`;
}

/** Contact email for legal notices (DMCA, 2257, privacy). */
export function legalContactEmail(domain: string): string {
  return siteContactEmail(domain);
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
