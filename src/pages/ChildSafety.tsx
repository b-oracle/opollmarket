import SEOHead from "@/components/SEOHead";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BackToTop from "@/components/BackToTop";

const LAST_UPDATED = "May 14, 2026";
const CONTACT_EMAIL = "boundlesspay@gmail.com";

const ChildSafety = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead
        title="Child Safety Standards"
        description="OPoll Market's published standards against child sexual abuse and exploitation (CSAE), in compliance with Google Play's Child Safety Standards Policy."
        path="/child-safety"
      />

      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 hover:bg-muted"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold">Child Safety Standards</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <article className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-bold">Our Commitment to Child Safety</h2>
            <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
            <p>
              OPoll Market has a zero-tolerance policy toward child sexual abuse
              and exploitation (CSAE), including the creation, possession,
              promotion, distribution, or solicitation of child sexual abuse
              material (CSAM). These standards apply to every user, every
              piece of user-generated content, and every feature of our app
              and platform across web, Android, and iOS.
            </p>
            <p>
              OPoll Market is intended for users aged 18 and over. We do not
              knowingly allow minors to register, hold accounts, or use our
              services. Any account discovered to belong to a minor is
              terminated immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold">1. Published Standards Against CSAE</h2>
            <p>The following content and behavior are strictly prohibited:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Any sexual content involving, depicting, or implying minors.</li>
              <li>Grooming, sextortion, solicitation, or sexualized communication directed at minors.</li>
              <li>Sharing, linking to, or promoting CSAM in markets, comments, posts, stories, spaces, communities, profiles, or direct messages.</li>
              <li>Trading, betting on, or creating prediction markets that sexualize, endanger, or exploit minors.</li>
              <li>Impersonation of a minor or use of imagery of minors in a sexualized context.</li>
              <li>Use of our messaging, voice, or video calling features to contact, groom, or exploit minors.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold">2. How We Prevent and Detect CSAE</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>18+ age gate</strong> at registration and during identity verification (KYC).</li>
              <li><strong>Identity verification (KYC)</strong> for elevated account features, with manual review of submitted documents.</li>
              <li><strong>Automated content moderation</strong> on uploaded images (markets, profiles, stories, posts, chat media) using image-classification models that flag suspected CSAM and nudity for human review.</li>
              <li><strong>Human moderation queue</strong> staffed by our trust &amp; safety team, with priority routing for CSAE-related reports.</li>
              <li><strong>In-app reporting</strong> on every user, market, comment, post, story, space, community, and message — accessible from the "..." or "Report" menu.</li>
              <li><strong>Account-level controls</strong> including blocking, muting, and disabling DMs from unknown users.</li>
              <li><strong>Logging and retention</strong> of moderation actions to enable law-enforcement cooperation.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold">3. How to Report CSAE</h2>
            <p>
              If you encounter content or behavior on OPoll Market that you
              believe involves the sexual abuse or exploitation of a child,
              please report it immediately using any of the following channels:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>In-app:</strong> tap the "..." menu on the content or user and choose <em>Report</em>. Select "Child safety / CSAE" as the reason.</li>
              <li><strong>Email:</strong> <a className="underline" href={`mailto:${CONTACT_EMAIL}?subject=CSAE%20Report`}>{CONTACT_EMAIL}</a> with subject line "CSAE Report".</li>
              <li><strong>Support ticket:</strong> via the in-app Support section, category "Child safety".</li>
            </ul>
            <p>
              Reports are reviewed on a 24/7 basis. Confirmed CSAM is removed,
              the offending account is permanently banned, and the incident is
              reported to the National Center for Missing &amp; Exploited
              Children (NCMEC) and/or the appropriate local authorities in
              accordance with applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold">4. Cooperation With Law Enforcement</h2>
            <p>
              OPoll Market preserves relevant evidence and cooperates with
              valid legal requests from law enforcement agencies investigating
              CSAE. We report apparent CSAM to NCMEC's CyberTipline as required
              by U.S. law (18 U.S.C. § 2258A) and to equivalent authorities in
              other jurisdictions where applicable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold">5. Designated Point of Contact</h2>
            <p>
              The designated point of contact for child safety standards,
              CSAM prevention practices, and compliance inquiries (including
              from Google Play, NCMEC, and law enforcement) is:
            </p>
            <p>
              <strong>Email:</strong>{" "}
              <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
            </p>
            <p>
              This contact is monitored regularly and is able to discuss our
              CSAM prevention practices, takedown procedures, and compliance
              posture.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold">6. Compliance</h2>
            <p>
              These standards are published in compliance with Google Play's
              Child Safety Standards Policy for apps in the Social and Dating
              categories, and reflect our ongoing commitment to keeping
              children safe online.
            </p>
          </section>
        </article>

        <BackToTop />
      </main>
    </div>
  );
};

export default ChildSafety;
