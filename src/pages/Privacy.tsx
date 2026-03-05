import SEOHead from "@/components/SEOHead";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BackToTop from "@/components/BackToTop";

const Privacy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <SEOHead title="Privacy Policy – OPollMarket" description="Learn how OPollMarket collects, uses, and protects your personal data. Our privacy policy covers data security, cookies, and your rights." path="/privacy" />
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Privacy Policy</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6 text-sm text-muted-foreground leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">1. Information We Collect</h2>
          <p>We collect information you provide directly, including: email address, display name, wallet address, and profile information. We also automatically collect usage data such as pages visited, trades placed, device information, IP address, and browser type to improve our services.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">2. How We Use Your Information</h2>
          <p>We use your information to: (a) provide and maintain the platform; (b) process your trades and transactions; (c) communicate with you about your account and platform updates; (d) detect and prevent fraud or abuse; (e) comply with legal obligations; (f) improve and personalize your experience; (g) generate anonymized analytics.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">3. Data Sharing</h2>
          <p>We do not sell your personal data to third parties. We may share information with: (a) service providers who assist in operating the platform; (b) law enforcement when required by law; (c) in connection with a merger, acquisition, or sale of assets. All third-party service providers are contractually bound to protect your data.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">4. Blockchain Data</h2>
          <p>Please be aware that blockchain transactions are publicly visible and permanently recorded. Your wallet address and transaction history on the blockchain are inherently public. We cannot delete or modify blockchain data once transactions are confirmed.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">5. Data Security</h2>
          <p>We implement industry-standard security measures to protect your information, including encryption in transit and at rest, secure authentication protocols, and regular security audits. However, no method of transmission or storage is 100% secure, and we cannot guarantee absolute security.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">6. Cookies and Tracking</h2>
          <p>We use essential cookies to maintain your session and preferences. We may also use analytics cookies to understand usage patterns. You can control cookie settings through your browser, though disabling essential cookies may affect platform functionality.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">7. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to: (a) access the personal data we hold about you; (b) request correction of inaccurate data; (c) request deletion of your data; (d) object to or restrict processing; (e) data portability; (f) withdraw consent. To exercise these rights, contact us through the platform.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">8. Data Retention</h2>
          <p>We retain your personal data for as long as your account is active or as needed to provide services. Transaction records are retained for compliance purposes. After account deletion, we may retain anonymized data for analytics. Legal hold requirements may extend retention periods.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">9. Children's Privacy</h2>
          <p>Our platform is not intended for users under 18 years of age. We do not knowingly collect personal information from minors. If we become aware that we have collected data from a minor, we will take steps to delete such information promptly.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">10. Changes to This Policy</h2>
          <p>We may update this Privacy Policy periodically. We will notify you of material changes through the platform or via email. Your continued use of the platform after changes take effect constitutes acceptance of the updated policy.</p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4">Last updated: March 2026</p>
      </div>
      <BackToTop />
    </div>
  );
};

export default Privacy;
