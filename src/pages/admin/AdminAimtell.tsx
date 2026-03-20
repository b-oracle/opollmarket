import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Send, Clock, Zap, Settings } from "lucide-react";
import AimtellConfig from "@/components/admin/aimtell/AimtellConfig";
import AimtellSendPush from "@/components/admin/aimtell/AimtellSendPush";
import AimtellScheduler from "@/components/admin/aimtell/AimtellScheduler";
import AimtellTemplates from "@/components/admin/aimtell/AimtellTemplates";
import AimtellAutoBroadcast from "@/components/admin/aimtell/AimtellAutoBroadcast";

const AdminAimtell = () => {
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [templateUrl, setTemplateUrl] = useState("");

  const handleUseTemplate = (template: { title: string; body: string; url: string }) => {
    setTemplateTitle(template.title);
    setTemplateBody(template.body);
    setTemplateUrl(template.url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Aimtell Push Notifications</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage browser push notifications, auto-broadcasts, scheduled campaigns, and segmentation.
        </p>
      </div>

      <Tabs defaultValue="send" className="w-full">
        <TabsList className="w-full grid grid-cols-5 h-auto">
          <TabsTrigger value="send" className="text-xs gap-1 py-2">
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Send</span>
          </TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs gap-1 py-2">
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Schedule</span>
          </TabsTrigger>
          <TabsTrigger value="auto" className="text-xs gap-1 py-2">
            <Zap className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Auto</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="text-xs gap-1 py-2">
            <Bell className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="text-xs gap-1 py-2">
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Config</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="space-y-4 mt-4">
          <AimtellSendPush
            externalTitle={templateTitle}
            externalBody={templateBody}
            externalUrl={templateUrl}
          />
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <AimtellScheduler />
        </TabsContent>

        <TabsContent value="auto" className="mt-4">
          <AimtellAutoBroadcast />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <AimtellTemplates onUseTemplate={handleUseTemplate} />
        </TabsContent>

        <TabsContent value="config" className="space-y-4 mt-4">
          <AimtellConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAimtell;
