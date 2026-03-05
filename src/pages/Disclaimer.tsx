import SEOHead from "@/components/SEOHead";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BackToTop from "@/components/BackToTop";

const Disclaimer = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <SEOHead title="Disclaimer – OPollMarket" description="Important disclaimers about using OPollMarket prediction markets. No financial advice — trade responsibly." path="/disclaimer" />
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Disclaimer</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6 text-sm text-muted-foreground leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">General Disclaimer</h2>
          <p>The information provided on this platform is for general informational and entertainment purposes only. Prediction markets involve financial risk, and you should not trade with funds you cannot afford to lose.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">No Financial Advice</h2>
          <p>Nothing on this platform constitutes financial, investment, legal, or tax advice. Market prices reflect the collective opinion of participants and should not be interpreted as guaranteed predictions of future events. Always conduct your own research and consult qualified professionals before making financial decisions.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Risk of Loss</h2>
          <p>Trading on prediction markets carries inherent risks. You may lose some or all of the funds you invest. Past performance of markets or positions does not guarantee future results. Market liquidity, volatility, and resolution outcomes are beyond the platform's control.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Market Resolution</h2>
          <p>Markets are resolved based on publicly available information and the resolution criteria specified at the time of market creation. While we strive for accuracy and fairness, resolution decisions are final once confirmed. Disputed resolutions will be reviewed by the platform administration team.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Platform Availability</h2>
          <p>We do not guarantee uninterrupted access to the platform. Services may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control. We are not liable for any losses resulting from platform downtime or technical issues.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Third-Party Content</h2>
          <p>This platform may contain links to third-party websites or reference external sources. We do not endorse, control, or assume responsibility for the content, privacy policies, or practices of any third-party services.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Regulatory Compliance</h2>
          <p>It is your responsibility to ensure that your use of this platform complies with all applicable laws and regulations in your jurisdiction. Prediction markets may be restricted or prohibited in certain regions. By using this platform, you confirm that you are legally permitted to do so in your location.</p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4">Last updated: March 2026</p>
      </div>
      <BackToTop />
    </div>
  );
};

export default Disclaimer;
