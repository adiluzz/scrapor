import type { Metadata } from "next";
import LegalPageShell from "@/components/site/LegalPageShell";
import { getCurrentSite } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: "Privacy Policy",
    description: `How ${site.name} collects, uses, and protects your personal data, including cookies and Google Analytics.`,
  };
}

export default async function PrivacyPage() {
  const site = await getCurrentSite();
  const contactEmail =
    process.env.SMTP_USER?.replace(/^.*<([^>]+)>.*$/, "$1") ||
    process.env.SMTP_USER ||
    `office@${site.domain}`;

  return (
    <LegalPageShell title="Privacy Policy" siteName={site.name}>
      <p>
        This Privacy Policy explains how {site.name} ({site.domain}) collects, uses, stores, and
        shares information when you visit or use our website. We are committed to transparency and to
        complying with applicable privacy laws, including the EU General Data Protection Regulation
        (GDPR) and the UK GDPR where they apply.
      </p>

      <h2>1. Who we are</h2>
      <p>
        The operator of {site.domain} is the data controller for personal data processed through this
        website. For privacy-related requests, contact us at{" "}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>

      <h2>2. Age restriction</h2>
      <p>
        This website contains sexually explicit material intended only for adults aged 18 or older
        (or the age of majority in your jurisdiction). We do not knowingly collect personal data
        from anyone under that age. If you are under 18, you must leave this site immediately.
      </p>

      <h2>3. Information we collect</h2>
      <p>Depending on how you use the site, we may process the following categories of data:</p>
      <ul>
        <li>
          <strong>Technical and usage data:</strong> IP address, browser type, device type,
          operating system, referring URL, pages viewed, timestamps, and similar log data generated
          when you access the site.
        </li>
        <li>
          <strong>Account data:</strong> If you register, we store your email address, display name,
          password hash, and account activity related to uploads or creator applications.
        </li>
        <li>
          <strong>Cookie and consent data:</strong> Your age-verification choice, cookie consent
          preference, and (if you are signed in) authentication session identifiers.
        </li>
        <li>
          <strong>Communications:</strong> Messages you send us (for example DMCA notices or support
          requests) and related metadata.
        </li>
      </ul>
      <p>
        We do not require you to provide real-name identity documents to browse public pages. Do not
        submit sensitive personal data through forms unless we explicitly ask for it.
      </p>

      <h2>4. Cookies and similar technologies</h2>
      <p>
        Cookies are small text files stored on your device. We group cookies on this site as follows:
      </p>

      <h3>Strictly necessary cookies</h3>
      <p>
        These cookies are required for the site to function and do not require consent under EU law.
        They include:
      </p>
      <ul>
        <li>
          <strong>age_verified</strong> — remembers that you confirmed you are 18+ (stored for up to
          one year).
        </li>
        <li>
          <strong>cookie_consent</strong> — stores your cookie preference (necessary only, or
          analytics accepted).
        </li>
        <li>
          <strong>Authentication cookies</strong> — session tokens used when you log in or sign up
          (for example Auth.js / NextAuth session and CSRF cookies).
        </li>
      </ul>

      <h3>Analytics cookies (optional)</h3>
      <p>
        If you click <strong>Accept analytics</strong> on our cookie banner, we load{" "}
        <strong>Google Analytics 4</strong> (Google Ireland Limited / Google LLC). Google Analytics
        uses cookies and similar identifiers to collect information about how visitors use the site,
        such as:
      </p>
      <ul>
        <li>Pages visited and time spent on pages</li>
        <li>Approximate geographic region (derived from IP address)</li>
        <li>Device, browser, and screen characteristics</li>
        <li>Referring website or campaign</li>
        <li>Interactions such as video page views and internal navigation</li>
      </ul>
      <p>
        We configure Google Analytics with IP anonymisation and with Google advertising signals
        disabled. Analytics scripts are <strong>not loaded</strong> until both conditions are met:
        (1) you have passed the age gate, and (2) you have accepted analytics cookies. If you choose{" "}
        <strong>Necessary only</strong>, Google Analytics is not loaded.
      </p>
      <p>
        Google may process data on servers outside your country, including the United States. Google
        participates in applicable data-transfer frameworks and offers contractual safeguards. See{" "}
        <a href="https://policies.google.com/privacy" rel="noopener noreferrer" target="_blank">
          Google&apos;s Privacy Policy
        </a>{" "}
        and{" "}
        <a
          href="https://support.google.com/analytics/answer/6004245"
          rel="noopener noreferrer"
          target="_blank"
        >
          Google Analytics data protection information
        </a>
        .
      </p>

      <h3>Advertising cookies (third parties)</h3>
      <p>
        We display third-party advertisements (for example through ExoClick). Ad partners may set
        their own cookies or use similar technologies to deliver ads, measure performance, and limit
        repeat impressions. These partners act as independent controllers or processors under their
        own privacy policies. We do not control their cookies; review their documentation for
        opt-out options.
      </p>

      <h2>5. How we use your information</h2>
      <p>We use personal data to:</p>
      <ul>
        <li>Operate, secure, and maintain the website</li>
        <li>Enforce age restrictions and legal compliance</li>
        <li>Provide account, upload, and creator features you request</li>
        <li>Respond to legal notices (including DMCA) and support enquiries</li>
        <li>Measure aggregate traffic and improve content discovery (only with analytics consent)</li>
        <li>Detect abuse, fraud, and technical issues</li>
      </ul>

      <h2>6. Legal bases (GDPR)</h2>
      <p>Where GDPR applies, we rely on:</p>
      <ul>
        <li>
          <strong>Consent</strong> — for optional analytics cookies and, where required, for certain
          marketing technologies.
        </li>
        <li>
          <strong>Legitimate interests</strong> — to secure the service, prevent abuse, and operate
          age-restricted content, balanced against your rights.
        </li>
        <li>
          <strong>Contract</strong> — to provide account features you sign up for.
        </li>
        <li>
          <strong>Legal obligation</strong> — to comply with record-keeping, law-enforcement, or
          copyright laws.
        </li>
      </ul>

      <h2>7. Sharing and processors</h2>
      <p>We may share data with:</p>
      <ul>
        <li>
          <strong>Google Analytics</strong> — website analytics (only after consent).
        </li>
        <li>
          <strong>Advertising partners</strong> — ad delivery and measurement.
        </li>
        <li>
          <strong>Infrastructure providers</strong> — hosting, CDN, email delivery, and cloud storage
          (for example AWS S3) that process data on our behalf under contract.
        </li>
        <li>
          <strong>Authorities</strong> — when required by law or to protect rights and safety.
        </li>
      </ul>
      <p>We do not sell your personal data.</p>

      <h2>8. Retention</h2>
      <ul>
        <li>
          <strong>age_verified / cookie_consent</strong> — up to 12 months, unless you clear cookies
          sooner.
        </li>
        <li>
          <strong>Account data</strong> — retained while your account is active and for a reasonable
          period afterward for legal and security purposes.
        </li>
        <li>
          <strong>Server logs</strong> — typically rotated within a limited period unless needed for
          security investigations.
        </li>
        <li>
          <strong>Google Analytics</strong> — subject to retention settings in our GA4 property
          (typically 2–14 months for event-level data).
        </li>
      </ul>

      <h2>9. Your rights</h2>
      <p>
        Depending on your location, you may have the right to access, rectify, erase, restrict, or
        object to processing of your personal data, and to data portability. Where processing is
        based on consent, you may withdraw consent at any time without affecting prior lawful
        processing.
      </p>
      <p>
        To change cookie preferences, use <strong>Cookie settings</strong> in the site footer. To
        exercise other rights, email{" "}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. You may also lodge a complaint with
        your local data-protection authority.
      </p>

      <h2>10. Security</h2>
      <p>
        We use HTTPS, access controls, and industry-standard practices to protect data. No method of
        transmission or storage is completely secure; we cannot guarantee absolute security.
      </p>

      <h2>11. International visitors</h2>
      <p>
        If you access the site from outside the country where our servers are located, your data may
        be transferred internationally. We implement appropriate safeguards where required by law.
      </p>

      <h2>12. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. The &quot;Last updated&quot; date at the
        top will change when we do. Material changes may be highlighted on the site.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about this policy or your data:{" "}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </LegalPageShell>
  );
}
