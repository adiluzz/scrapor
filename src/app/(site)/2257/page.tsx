import type { Metadata } from "next";
import LegalPageShell from "@/components/site/LegalPageShell";
import { custodianAddress, custodianName, legalContactEmail } from "@/lib/legal-contact";
import { getCurrentSite } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: "2257 Statement",
    description: `18 U.S.C. § 2257 record-keeping compliance statement for ${site.name}.`,
    alternates: { canonical: "/2257" },
  };
}

export default async function Statement2257Page() {
  const site = await getCurrentSite();
  const contactEmail = legalContactEmail(site.domain);
  const custodian = custodianName(site.name);
  const address = custodianAddress(site.domain, contactEmail);

  return (
    <LegalPageShell title="18 U.S.C. § 2257 Statement" siteName={site.name}>
      <p>
        All models, actors, actresses, and other persons that appear in any visual depiction of
        actual or simulated sexually explicit conduct appearing on or otherwise contained in{" "}
        {site.domain} (the &quot;Website&quot;) were over the age of eighteen (18) years at the time
        of the creation of such depictions.
      </p>

      <h2>Compliance statement</h2>
      <p>
        {site.name} is committed to compliance with United States law, including{" "}
        <strong>18 U.S.C. § 2257</strong> and <strong>28 C.F.R. Part 75</strong>, regarding
        record-keeping requirements for producers of sexually explicit material.
      </p>

      <h2>Third-party and aggregated content</h2>
      <p>
        Much of the content indexed or displayed on the Website consists of visual depictions that
        were <strong>not produced by {site.name}</strong> but are publicly available from third-party
        sources. With respect to those depictions, the records required under 18 U.S.C. § 2257 and 28
        C.F.R. 75 are maintained by the respective producers, primary producers, or custodians of
        records associated with the original source material, not by {site.name}.
      </p>
      <p>
        {site.name} does not undertake to verify the age of performers in third-party material beyond
        reasonable measures consistent with operating an indexing and hosting platform. If you believe
        any content on the Website depicts a person under 18, contact us immediately at{" "}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a> and we will investigate and remove the
        material where appropriate.
      </p>

      <h2>Creator-uploaded content</h2>
      <p>
        For visual depictions of actual sexually explicit conduct that are uploaded directly to the
        Website by registered creators and for which {site.name} acts as the <strong>producer</strong>{" "}
        (as defined in 28 C.F.R. 75.1), {site.name} maintains records in accordance with 18 U.S.C.
        § 2257 and 28 C.F.R. Part 75. Creator submissions are subject to our age and identity
        verification procedures before publication.
      </p>

      <h2>Custodian of Records</h2>
      <p>
        The Custodian of Records for content for which {site.name} is the producer is:
      </p>
      <ul>
        <li>
          <strong>Name:</strong> {custodian}
        </li>
        <li>
          <strong>Address:</strong> {address}
        </li>
        <li>
          <strong>Email:</strong>{" "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </li>
      </ul>
      <p>
        Records are available for inspection by authorized law-enforcement or regulatory personnel
        during normal business hours upon reasonable notice.
      </p>

      <h2>Exemption</h2>
      <p>
        Content produced by third parties and merely linked to, embedded from, or reproduced from
        publicly available sources may be exempt from the record-keeping requirements of 18 U.S.C.
        § 2257 where the producer of the original depiction is not {site.name}. Nothing in this
        statement limits our obligation to remove unlawful content upon notice.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this statement or record-keeping compliance:{" "}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </LegalPageShell>
  );
}
