import { Wrench } from "lucide-react";
import SEOHead from "@/components/SEOHead";

const Maintenance = () => (
  <>
    <SEOHead title="Maintenance" description="We're performing scheduled maintenance. We'll be back shortly." />
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto animate-pulse">
          <Wrench className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">We'll be right back</h1>
          <p className="text-sm text-muted-foreground">
            OPoll Market is currently undergoing scheduled maintenance. We're working to improve your experience.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-2">
          <p className="text-xs text-muted-foreground">Estimated downtime</p>
          <p className="text-lg font-bold text-foreground">~30 minutes</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Follow us on X for updates: <a href="https://x.com/opoll" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">@opoll</a>
        </p>
      </div>
    </div>
  </>
);

export default Maintenance;
