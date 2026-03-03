import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Download,
} from "lucide-react";

interface ParsedMarket {
  title: string;
  description: string;
  category: string;
  end_date: string;
  resolution_source: string;
  initial_liquidity: number;
  market_type: "binary" | "multi";
  trending: boolean;
  options?: string[];
  error?: string;
}

const REQUIRED_HEADERS = ["title", "description", "category", "end_date", "resolution_source"];
const VALID_CATEGORIES = ["Crypto", "AI & Tech", "Science", "Economy", "Entertainment", "Sports", "Politics", "Other"];

const TEMPLATE_CSV = `title,description,category,end_date,resolution_source,initial_liquidity,market_type,trending,options
"Will Bitcoin hit $150K by July 2026?","Based on BTC/USD price on major exchanges","Crypto","2026-07-01","CoinGecko price data",100,binary,false,
"Who will win the 2026 World Cup?","FIFA World Cup 2026 winner","Sports","2026-12-31","Official FIFA results",200,multi,true,"Brazil|Germany|Argentina|France"`;

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(current.trim());
        current = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(current.trim());
        if (row.some((c) => c)) rows.push(row);
        row = [];
        current = "";
      } else {
        current += ch;
      }
    }
  }
  row.push(current.trim());
  if (row.some((c) => c)) rows.push(row);
  return rows;
}

function validateRow(headers: string[], values: string[]): ParsedMarket {
  const get = (key: string) => {
    const idx = headers.indexOf(key);
    return idx >= 0 ? (values[idx] || "").trim() : "";
  };

  const title = get("title");
  const description = get("description");
  const category = get("category");
  const end_date = get("end_date");
  const resolution_source = get("resolution_source");
  const initial_liquidity = parseFloat(get("initial_liquidity")) || 100;
  const market_type = get("market_type") === "multi" ? "multi" : "binary";
  const trending = get("trending").toLowerCase() === "true";
  const optionsStr = get("options");
  const options = optionsStr ? optionsStr.split("|").map((o) => o.trim()).filter(Boolean) : undefined;

  const errors: string[] = [];
  if (title.length < 10) errors.push("Title too short (min 10 chars)");
  if (description.length < 10) errors.push("Description too short (min 10 chars)");
  if (!VALID_CATEGORIES.includes(category)) errors.push(`Invalid category "${category}"`);
  if (!end_date || isNaN(Date.parse(end_date))) errors.push("Invalid end_date");
  if (resolution_source.length < 5) errors.push("Resolution source too short");
  if (market_type === "multi" && (!options || options.length < 2)) errors.push("Multi markets need 2+ options (pipe-separated)");

  return {
    title, description, category, end_date, resolution_source,
    initial_liquidity, market_type, trending, options,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

interface BulkCSVImportProps {
  onComplete: () => void;
}

const BulkCSVImport = ({ onComplete }: BulkCSVImportProps) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedMarket[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number } | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [dragging, setDragging] = useState(false);

  const processFile = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error("CSV must have a header row and at least one data row");
        return;
      }
      const headers = rows[0].map((h) => h.toLowerCase().trim());
      const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        toast.error(`Missing required columns: ${missing.join(", ")}`);
        return;
      }
      const markets = rows.slice(1).map((row) => validateRow(headers, row));
      setParsed(markets);
      setResults(null);
    };
    reader.readAsText(file);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "market-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!user) return;
    const valid = parsed.filter((m) => !m.error);
    if (valid.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    setImporting(true);
    setProgress({ current: 0, total: valid.length });
    let success = 0;
    let failed = 0;

    for (const m of valid) {
      try {
        const { data, error } = await supabase
          .from("markets")
          .insert({
            creator_wallet: user.id,
            creator_name: user.user_metadata?.display_name || user.email?.split("@")[0] || "Admin",
            title: m.title,
            description: m.description,
            category: m.category,
            end_date: m.end_date,
            resolution_source: m.resolution_source,
            initial_liquidity: m.initial_liquidity,
            liquidity: m.initial_liquidity,
            market_type: m.market_type,
            trending: m.trending,
            status: "active",
          })
          .select("id")
          .maybeSingle();

        if (error) throw error;

        if (m.market_type === "multi" && m.options && data?.id) {
          const equalPrice = Math.round((1 / m.options.length) * 100) / 100;
          await supabase.from("market_options").insert(
            m.options.map((label, i) => ({
              market_id: data.id,
              label,
              price: equalPrice,
              sort_order: i,
            }))
          );
        }
        success++;
      } catch {
        failed++;
      }
      setProgress({ current: success + failed, total: valid.length });
    }

    setResults({ success, failed });
    setImporting(false);
    if (success > 0) {
      toast.success(`${success} market${success > 1 ? "s" : ""} created!`);
      onComplete();
    }
  };

  const validCount = parsed.filter((m) => !m.error).length;
  const errorCount = parsed.filter((m) => m.error).length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-all active:scale-95"
      >
        <FileSpreadsheet className="w-3.5 h-3.5" />
        Bulk CSV
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={() => { if (!importing) { setOpen(false); setParsed([]); setResults(null); } }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-card border border-border rounded-2xl p-6 w-full max-w-lg mx-4 z-10 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold">Bulk CSV Import</h3>
                </div>
                <button
                  onClick={() => { if (!importing) { setOpen(false); setParsed([]); setResults(null); } }}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Template download */}
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium mb-4"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV template
              </button>

              {/* Upload area */}
              {parsed.length === 0 && !results && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`w-full h-36 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                    dragging
                      ? "border-primary bg-primary/10 scale-[1.02]"
                      : "border-border hover:border-primary/40 hover:bg-primary/5"
                  }`}
                >
                  <Upload className={`w-8 h-8 ${dragging ? "text-primary" : "text-muted-foreground"}`} />
                  <p className="text-sm text-muted-foreground">
                    {dragging ? "Drop CSV file here" : "Drag & drop or click to upload CSV"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Required: title, description, category, end_date, resolution_source
                  </p>
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                    <FileSpreadsheet className="w-3 h-3" />
                    .csv only
                  </span>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />

              {/* Preview */}
              {parsed.length > 0 && !results && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-green-500 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {validCount} valid
                    </span>
                    {errorCount > 0 && (
                      <span className="flex items-center gap-1 text-destructive font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" /> {errorCount} errors
                      </span>
                    )}
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {parsed.map((m, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-lg border text-xs ${
                          m.error
                            ? "border-destructive/30 bg-destructive/5"
                            : "border-border bg-muted/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{m.title || "(empty title)"}</p>
                            <p className="text-muted-foreground">
                              {m.category} · {m.market_type} · {m.end_date}
                            </p>
                          </div>
                          {m.error ? (
                            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                          )}
                        </div>
                        {m.error && (
                          <p className="text-destructive mt-1">{m.error}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Progress bar */}
                  {importing && progress.total > 0 && (
                    <div className="pt-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                        <span>Creating markets...</span>
                        <span>{progress.current} / {progress.total}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                          style={{ width: `${(progress.current / progress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => { setParsed([]); }}
                      disabled={importing}
                      className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={validCount === 0 || importing}
                      className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {importing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {progress.current} / {progress.total}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Import {validCount} Market{validCount !== 1 ? "s" : ""}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Results */}
              {results && (
                <div className="space-y-3 text-center py-4">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                  <div>
                    <p className="text-lg font-bold">{results.success} market{results.success !== 1 ? "s" : ""} created</p>
                    {results.failed > 0 && (
                      <p className="text-sm text-destructive">{results.failed} failed</p>
                    )}
                  </div>
                  <button
                    onClick={() => { setOpen(false); setParsed([]); setResults(null); }}
                    className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default BulkCSVImport;
