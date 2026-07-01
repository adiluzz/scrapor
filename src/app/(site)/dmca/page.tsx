import type { Metadata } from "next";
import LegalPageShell from "@/components/site/LegalPageShell";
import { legalContactEmail } from "@/lib/legal-contact";
import { getCurrentSite } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: "DMCA Policy",
    description: `Copyright infringement and DMCA takedown policy for ${site.name}.`,
  };
}

export default async function DmcaPage() {
  const site = await getCurrentSite();
  const contactEmail = legalContactEmail(site.domain);

  return (
    <LegalPageShell title="DMCA / Copyright Policy" siteName={site.name}>
      <p>
        {site.name} respects the intellectual property rights of others and expects users and
        partners to do the same. In accordance with the{" "}
        <strong>Digital Millennium Copyright Act of 1998</strong> (&quot;DMCA&quot;), 17 U.S.C. §
        512, we respond to notices of alleged copyright infringement that comply with the DMCA and
        other applicable law.
      </p>

      <h2>Designated agent</h2>
      <p>
        Send DMCA notices and counter-notifications to our designated copyright agent:
      </p>
      <ul>
        <li>
          <strong>Service:</strong> {site.name} DMCA Agent
        </li>
        <li>
          <strong>Email:</strong>{" "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </li>
        <li>
          <strong>Subject line:</strong> DMCA Takedown Notice — {site.domain}
        </li>
      </ul>
      <p>
        Only DMCA notices should be sent to this address. For general support, privacy requests, or
        non-copyright issues, use the same email and specify the nature of your enquiry.
      </p>

      <h2>Filing a takedown notice</h2>
      <p>
        If you believe that content on {site.domain} infringes your copyright, please send a written
        notice that includes <strong>all</strong> of the following (see 17 U.S.C. § 512(c)(3)):
      </p>
      <ul>
        <li>
          Your physical or electronic signature (typing your full legal name in an email is
          sufficient if you are the rights holder or authorized agent).
        </li>
        <li>
          Identification of the copyrighted work you claim has been infringed (or a representative
          list if multiple works are covered by one notice).
        </li>
        <li>
          Identification of the material you claim is infringing, with enough detail for us to locate
          it on the Website (for example the full URL of the video page on {site.domain}).
        </li>
        <li>
          Your contact information: name, mailing address, telephone number, and email address.
        </li>
        <li>
          A statement that you have a <strong>good-faith belief</strong> that use of the material is
          not authorized by the copyright owner, its agent, or the law.
        </li>
        <li>
          A statement, under penalty of perjury, that the information in the notice is accurate and
          that you are the copyright owner or authorized to act on the owner&apos;s behalf.
        </li>
      </ul>
      <p>
        Incomplete notices may delay processing. We may forward your notice to the user who posted
        the content where applicable.
      </p>

      <h2>Our response</h2>
      <p>
        When we receive a valid DMCA notice, we will expeditiously remove or disable access to the
        allegedly infringing material. We may notify the uploader or account holder and provide an
        opportunity to submit a counter-notification where appropriate.
      </p>

      <h2>Counter-notification</h2>
      <p>
        If you believe your content was removed by mistake or misidentification, you may send a
        counter-notification to <a href={`mailto:${contactEmail}`}>{contactEmail}</a> containing:
      </p>
      <ul>
        <li>Your physical or electronic signature.</li>
        <li>Identification of the material that was removed and where it appeared before removal.</li>
        <li>
          A statement under penalty of perjury that you have a good-faith belief the material was
          removed as a result of mistake or misidentification.
        </li>
        <li>
          Your name, address, and telephone number, and a statement that you consent to the
          jurisdiction of the Federal District Court for the judicial district in which your address
          is located (or, if outside the U.S., any judicial district in which {site.name} may be
          found), and that you will accept service of process from the person who submitted the
          original DMCA notice or their agent.
        </li>
      </ul>
      <p>
        If we receive a valid counter-notification, we may restore the material after at least ten
        (10) business days and no more than fourteen (14) business days, unless the copyright owner
        notifies us that they have filed a court action.
      </p>

      <h2>Repeat infringers</h2>
      <p>
        It is our policy to terminate, in appropriate circumstances, the accounts of users who are
        repeat infringers of copyright.
      </p>

      <h2>Misrepresentations</h2>
      <p>
        Under 17 U.S.C. § 512(f), any person who knowingly materially misrepresents that material is
        infringing, or that material was removed by mistake, may be liable for damages. Please ensure
        your notice or counter-notification is accurate before submitting.
      </p>

      <h2>Related policies</h2>
      <p>
        See also our <a href="/privacy">Privacy Policy</a> and{" "}
        <a href="/2257">2257 Statement</a>.
      </p>
    </LegalPageShell>
  );
}
