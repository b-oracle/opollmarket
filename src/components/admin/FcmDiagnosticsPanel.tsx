import { CheckCircle2, XCircle, AlertCircle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StageRowProps {
  label: string;
  ok: boolean | null;
  detail?: string | null;
}

const StageRow = ({ label, ok, detail }: StageRowProps) => (
  <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
    <div className="flex items-center gap-2 min-w-0">
      {ok === null ? (
        <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      ) : ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
      )}
      <span className="text-xs font-medium">{label}</span>
    </div>
    {detail && (
      <span className="text-[10px] text-muted-foreground font-mono text-right break-all max-w-[60%]">
        {detail}
      </span>
    )}
  </div>
);

interface TokenResult {
  token_id: string;
  token_tail: string;
  ok: boolean;
  http_status: number;
  fcm_error_status: string | null;
  fcm_error_code: string | null;
  fcm_error_message: string | null;
  hint: string | null;
  removed: boolean;
}

/**
 * Renders the structured response from send-fcm-push (test mode).
 */
export const FcmTestDiagnostics = ({ data, error }: { data: any; error: string | null }) => {
  if (error) {
    return (
      <div className="border border-destructive/50 bg-destructive/10 rounded-md p-3 space-y-1">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs font-semibold">Function invocation failed</span>
        </div>
        <p className="text-[11px] font-mono break-all text-destructive/90">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  const stage: string = data.stage ?? "unknown";
  const hasSa: boolean = !!data.has_service_account;
  const hasProject: boolean = !!data.has_project_id;
  const oauthOk: boolean | null = stage === "env" || stage === "parse_sa"
    ? false
    : stage === "oauth2" && !data.ok
      ? false
      : data.oauth2_ok ?? null;
  const fcmTested = stage === "fcm_send";
  const fcmOk = fcmTested ? !!data.ok : null;

  return (
    <div className="border border-border rounded-md p-3 bg-muted/30 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Diagnostic Stages</p>
        <Badge variant={data.ok ? "default" : "destructive"} className="text-[10px]">
          {data.ok ? "PASS" : "FAIL"} · {stage}
        </Badge>
      </div>

      <div>
        <StageRow
          label="Service account secret present"
          ok={hasSa}
          detail={data.client_email || (hasSa ? "loaded" : "FCM_SERVICE_ACCOUNT_JSON missing")}
        />
        <StageRow
          label="Firebase project ID configured"
          ok={hasProject}
          detail={data.project_id || (hasProject ? "set" : "FCM_PROJECT_ID missing")}
        />
        {stage === "parse_sa" && (
          <StageRow
            label="Service account JSON valid"
            ok={false}
            detail={data.error || "Failed to parse JSON"}
          />
        )}
        <StageRow
          label="OAuth2 token (Google → firebase.messaging scope)"
          ok={oauthOk}
          detail={
            stage === "oauth2" && !data.ok
              ? data.error || "OAuth2 exchange failed"
              : oauthOk
                ? "access_token issued"
                : oauthOk === false
                  ? "skipped (env failed)"
                  : "—"
          }
        />
        {fcmTested && (
          <StageRow
            label={`FCM v1 dry-run (validate_only)`}
            ok={fcmOk}
            detail={
              fcmOk
                ? `HTTP ${data.http_status}`
                : `HTTP ${data.http_status} · ${data.fcm_error_code || data.fcm_error_status || "error"}`
            }
          />
        )}
      </div>

      {fcmTested && !fcmOk && (data.fcm_error_message || data.hint) && (
        <div className="border-t border-border/50 pt-2 space-y-1">
          {data.fcm_error_message && (
            <p className="text-[11px] font-mono text-destructive break-all">
              {data.fcm_error_message}
            </p>
          )}
          {data.hint && (
            <p className="text-[11px] text-muted-foreground italic">💡 {data.hint}</p>
          )}
        </div>
      )}

      <details className="text-[10px]">
        <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
          Raw response
        </summary>
        <pre className="mt-1 p-2 bg-background border border-border rounded overflow-auto max-h-60 whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
};

/**
 * Renders the structured response from admin-test-call-push.
 */
export const CallTestDiagnostics = ({ data, error }: { data: any; error: string | null }) => {
  if (error) {
    return (
      <div className="border border-destructive/50 bg-destructive/10 rounded-md p-3 space-y-1">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs font-semibold">Function invocation failed</span>
        </div>
        <p className="text-[11px] font-mono break-all text-destructive/90">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  const tokens: number = data.tokens_on_file ?? 0;
  const sent: number = data.sent ?? 0;
  const expired: number = data.expired ?? 0;
  const results: TokenResult[] = Array.isArray(data.results) ? data.results : [];

  return (
    <div className="border border-border rounded-md p-3 bg-muted/30 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <p className="text-xs font-semibold">Call Push Result</p>
        <div className="flex items-center gap-1.5">
          <Badge variant={sent > 0 ? "default" : "destructive"} className="text-[10px]">
            {sent}/{tokens} delivered
          </Badge>
          {expired > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {expired} pruned
            </Badge>
          )}
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground space-y-0.5">
        <div>
          <span className="font-semibold">Call ID:</span>{" "}
          <span className="font-mono">{data.call_id}</span>
        </div>
        <div>
          <span className="font-semibold">Target:</span>{" "}
          <span className="font-mono">{data.target_user_id}</span>
        </div>
      </div>

      {tokens === 0 && (
        <div className="border border-destructive/40 bg-destructive/10 text-destructive rounded p-2 text-[11px] flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            No FCM tokens on file for this user. They must open the installed Android/iOS app while
            signed in for <code>useNativePush</code> to register a token.
          </span>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">
            Per-Token Results
          </p>
          {results.map((r) => (
            <div
              key={r.token_id}
              className={`border rounded p-2 space-y-1 ${
                r.ok
                  ? "border-primary/30 bg-primary/5"
                  : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono">{r.token_tail || r.token_id.slice(0, 8)}</span>
                <div className="flex items-center gap-1">
                  {r.ok ? (
                    <Badge className="text-[10px]">OK</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">
                      HTTP {r.http_status}
                    </Badge>
                  )}
                  {r.removed && (
                    <Badge variant="outline" className="text-[10px]">
                      removed
                    </Badge>
                  )}
                </div>
              </div>
              {!r.ok && (
                <>
                  {(r.fcm_error_code || r.fcm_error_status) && (
                    <p className="text-[10px] font-mono text-destructive">
                      {r.fcm_error_status}
                      {r.fcm_error_code ? ` · ${r.fcm_error_code}` : ""}
                    </p>
                  )}
                  {r.fcm_error_message && (
                    <p className="text-[10px] font-mono break-all text-destructive/80">
                      {r.fcm_error_message}
                    </p>
                  )}
                  {r.hint && (
                    <p className="text-[10px] italic text-muted-foreground">💡 {r.hint}</p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <details className="text-[10px]">
        <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
          Raw response
        </summary>
        <pre className="mt-1 p-2 bg-background border border-border rounded overflow-auto max-h-60 whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
};
