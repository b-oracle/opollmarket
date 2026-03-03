import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BackToTop from "@/components/BackToTop";

const Terms = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Terms & Conditions</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6 text-sm text-muted-foreground leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">1. Acceptance of Terms</h2>
          <p>By accessing or using this platform, you agree to be bound by these Terms & Conditions. If you do not agree with any part of these terms, you must not use our services. We reserve the right to update these terms at any time, and continued use of the platform constitutes acceptance of any changes.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">2. Eligibility</h2>
          <p>You must be at least 18 years of age to use this platform. By registering an account, you represent and warrant that you meet this age requirement and that all information you provide is accurate and complete. Users are responsible for ensuring their participation complies with local laws and regulations.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">3. Account Responsibilities</h2>
          <p>You are responsible for maintaining the confidentiality of your account credentials, including your wallet connection and login information. You agree to notify us immediately of any unauthorized use of your account. We are not liable for any loss arising from unauthorized access to your account.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">4. Trading Rules</h2>
          <p>All trades are final once confirmed. Market prices are determined by supply and demand among participants. The platform does not guarantee any particular outcome or return. Manipulation of markets, including wash trading, coordinated trading, or exploitation of system vulnerabilities, is strictly prohibited and may result in account suspension.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">5. Fees and Payments</h2>
          <p>The platform charges commissions on winning trades as displayed at the time of transaction. Fee structures may be updated periodically. All deposits and withdrawals are processed through supported cryptocurrency methods. Processing times may vary based on network conditions.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">6. Market Creation</h2>
          <p>Users may propose new markets subject to review and approval. Market creators must provide clear, unambiguous resolution criteria. The platform reserves the right to reject, modify, or cancel any market at its discretion. Markets that violate community guidelines or promote harmful content will be removed.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">7. Prohibited Conduct</h2>
          <p>Users may not: (a) use the platform for money laundering or other illegal activities; (b) attempt to manipulate market outcomes; (c) create multiple accounts to circumvent restrictions; (d) use automated bots without prior authorization; (e) harass, threaten, or abuse other users; (f) interfere with the platform's operation or security.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">8. Intellectual Property</h2>
          <p>All content, branding, and technology on this platform are the property of the platform operators or their licensors. You may not reproduce, distribute, or create derivative works without explicit written permission. User-generated content (comments, market proposals) grants us a non-exclusive license to display and distribute such content on the platform.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">9. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law, the platform and its operators shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the platform. Our total liability shall not exceed the amount of fees paid by you in the preceding 12 months.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">10. Termination</h2>
          <p>We reserve the right to suspend or terminate your account at any time for violation of these terms or for any other reason at our discretion. Upon termination, your right to use the platform ceases immediately. Any outstanding balances will be handled in accordance with our withdrawal policies.</p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4">Last updated: March 2026</p>
      </div>
      <BackToTop />
    </div>
  );
};

export default Terms;
