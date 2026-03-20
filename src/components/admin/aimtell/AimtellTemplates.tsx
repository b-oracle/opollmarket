import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PushTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
  url: string;
}

interface AimtellTemplatesProps {
  onUseTemplate: (template: PushTemplate) => void;
}

const AimtellTemplates = ({ onUseTemplate }: AimtellTemplatesProps) => {
  const [templates, setTemplates] = useState<PushTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("aimtell_push_templates" as any)
      .select("*")
      .order("name");
    if (!error) setTemplates((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4" />
              Push Templates
            </CardTitle>
            <CardDescription>Click a template to use it in the send form</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchTemplates}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => onUseTemplate(tpl)}
              className="text-left border rounded-lg p-3 hover:bg-accent/50 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px]">{tpl.name}</Badge>
              </div>
              <p className="text-sm font-medium truncate">{tpl.title}</p>
              <p className="text-xs text-muted-foreground truncate">{tpl.body}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AimtellTemplates;
