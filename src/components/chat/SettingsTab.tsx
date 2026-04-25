import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Phone, MessageCircle, Eye, EyeOff, BarChart3, History, BellOff,
  Copy, Gift, DollarSign, Sparkles, Monitor, Vibrate, Smartphone, Bell, BellRing,
} from "lucide-react";
import { toast } from "sonner";
import { useDevicePrefs } from "@/hooks/useDevicePrefs";
import {
  getPushPermission,
  requestPushPermission,
  type PushPermissionState,
} from "@/lib/pushPermission";
import { hapticSelection } from "@/lib/haptics";

interface UserSettings {
  allow_calls: boolean;
  allow_dms: boolean;
  private_account: boolean;
  show_online_status: boolean;
  show_portfolio: boolean;
  show_trade_history: boolean;
  mute_notifications: boolean;
  allow_copy_trading: boolean;
  allow_dm_gifts: boolean;
  allow_dm_money: boolean;
  enable_gift_animations: boolean;
  allow_screen_sharing: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  allow_calls: true,
  allow_dms: true,
  private_account: false,
  show_online_status: true,
  show_portfolio: true,
  show_trade_history: true,
  mute_notifications: false,
  allow_copy_trading: true,
  allow_dm_gifts: true,
  allow_dm_money: true,
  enable_gift_animations: true,
  allow_screen_sharing: true,
};

const SETTING_GROUPS = [
  {
    title: "Communication",
    items: [
      { key: "allow_calls" as const, label: "Allow Calls", desc: "Let others call you via DMs", icon: Phone },
      { key: "allow_dms" as const, label: "Allow Message Requests", desc: "Receive new message requests", icon: MessageCircle },
      { key: "allow_dm_gifts" as const, label: "Allow DM Gifts", desc: "Let others send you emoji gifts", icon: Gift },
      { key: "allow_dm_money" as const, label: "Allow Money Transfers", desc: "Let others send you money via DMs", icon: DollarSign },
      { key: "allow_screen_sharing" as const, label: "Allow Screen Sharing", desc: "Let others share their screen during calls", icon: Monitor },
    ],
  },
  {
    title: "Privacy",
    items: [
      { key: "private_account" as const, label: "Private Account", desc: "Hide profile from search and rankings", icon: EyeOff },
      { key: "show_online_status" as const, label: "Show Online Status", desc: "Show green dot when active", icon: Eye },
      { key: "show_portfolio" as const, label: "Show Portfolio", desc: "Let others see your portfolio", icon: BarChart3 },
      { key: "show_trade_history" as const, label: "Show Trade History", desc: "Let others see your trades", icon: History },
    ],
  },
  {
    title: "Notifications & Trading",
    items: [
      { key: "mute_notifications" as const, label: "Mute Notifications", desc: "Silence all push notifications", icon: BellOff },
      { key: "allow_copy_trading" as const, label: "Allow Copy Trading", desc: "Let others copy your trades", icon: Copy },
      { key: "enable_gift_animations" as const, label: "Gift Animations", desc: "Show fun animations on gift taps", icon: Sparkles },
    ],
  },
];
const SettingsTab = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["user-settings", user?.id],
    queryFn: async () => {
      if (!user) return DEFAULT_SETTINGS;
      const { data } = await supabase
        .from("user_settings" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle() as any;

      if (!data) {
        // Create default settings row
        await supabase.from("user_settings" as any).insert({ user_id: user.id } as any);
        return DEFAULT_SETTINGS;
      }
      return data as UserSettings;
    },
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<UserSettings>) => {
      if (!user) throw new Error("Not logged in");
      const { error } = await supabase
        .from("user_settings" as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
    onError: () => {
      toast.error("Failed to update setting");
    },
  });

  const handleToggle = (key: keyof UserSettings) => {
    if (!settings) return;
    updateMutation.mutate({ [key]: !settings[key] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {SETTING_GROUPS.map((group) => (
        <div key={group.title}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {group.title}
          </h3>
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const value = settings?.[item.key] ?? DEFAULT_SETTINGS[item.key];
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent/30 transition-colors"
                >
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-sm font-medium cursor-pointer">{item.label}</Label>
                    <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch
                    checked={!!value}
                    onCheckedChange={() => handleToggle(item.key)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SettingsTab;
