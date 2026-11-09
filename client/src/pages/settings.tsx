import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Settings, Globe, Bell, Shield, Palette, Monitor, BellOff, ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isLanguage } from "@shared/i18n";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language-provider";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ProfileForm } from "@/components/profile-form";
import { useDesktopNotifications } from "@/hooks/use-desktop-notifications";
import { isLoginSummaryEnabled, setLoginSummaryEnabled } from "@/components/login-summary";

export default function SettingsPage() {
  const { user, refetchUser } = useAuth();
  const { settings: desktopSettings, permissionState, toggleEnabled, updateSetting } = useDesktopNotifications();
  const [summaryOn, setSummaryOn] = useState(() => (user?.id ? isLoginSummaryEnabled(user.id) : true));
  const { t } = useTranslation(["common", "settings"]);
  const { language, setLanguage } = useLanguage();
  const { toast } = useToast();
  const [savingLanguage, setSavingLanguage] = useState(false);

  // The direction follows from the language, so there is no separate RTL switch: picking العربية turns
  // the whole app right-to-left at once. The choice is saved on the user so it follows them to any
  // other device; if that save fails, the UI stays in the new language for this browser only.
  const onLanguageChange = async (value: string) => {
    if (!isLanguage(value) || value === language) return;
    setLanguage(value);
    if (!user?.id) return;
    setSavingLanguage(true);
    try {
      await apiRequest("PATCH", `/api/users/${user.id}`, { language: value });
      await refetchUser();
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("language.label"),
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSavingLanguage(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-display font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your application preferences</p>
        </div>
      </div>

      <div className="grid gap-6">
        {user && <ProfileForm user={user} />}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Language & Region
            </CardTitle>
            <CardDescription>Configure language and regional settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("language.label")}</Label>
                <p className="text-sm text-muted-foreground">{t("language.description")}</p>
              </div>
              <Select value={language} onValueChange={onLanguageChange} disabled={savingLanguage}>
                <SelectTrigger className="w-[180px]" data-testid="select-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">{t("language.ar")}</SelectItem>
                  <SelectItem value="en">{t("language.en")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Timezone</Label>
                <p className="text-sm text-muted-foreground">Select your preferred timezone for date displays</p>
              </div>
              <Select defaultValue="gmt+3">
                <SelectTrigger className="w-[180px]" data-testid="select-timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gmt+3">GMT+3 (Saudi Arabia)</SelectItem>
                  <SelectItem value="gmt+0">GMT+0 (UTC)</SelectItem>
                  <SelectItem value="gmt+1">GMT+1 (Central Europe)</SelectItem>
                  <SelectItem value="gmt+2">GMT+2 (Eastern Europe)</SelectItem>
                  <SelectItem value="gmt+4">GMT+4 (Dubai)</SelectItem>
                  <SelectItem value="gmt+5">GMT+5 (Pakistan)</SelectItem>
                  <SelectItem value="gmt+5:30">GMT+5:30 (India)</SelectItem>
                  <SelectItem value="gmt+8">GMT+8 (Singapore/China)</SelectItem>
                  <SelectItem value="gmt-5">GMT-5 (US Eastern)</SelectItem>
                  <SelectItem value="gmt-8">GMT-8 (US Pacific)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
            </CardTitle>
            <CardDescription>Manage notification preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label>{t("settings:login_summary.label")}</Label>
                  <p className="text-sm text-muted-foreground">{t("settings:login_summary.description")}</p>
                </div>
              </div>
              <Switch
                checked={summaryOn}
                onCheckedChange={(v) => { setSummaryOn(v); if (user?.id) setLoginSummaryEnabled(user.id, v); }}
                data-testid="switch-login-summary"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label>Desktop Notifications</Label>
                  <p className="text-sm text-muted-foreground">Show browser popup alerts for new notifications</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {permissionState === "denied" && (
                  <Badge variant="outline" className="text-[10px] border-destructive text-destructive">
                    Blocked by Browser
                  </Badge>
                )}
                {permissionState === "granted" && desktopSettings.enabled && (
                  <Badge variant="outline" className="text-[10px] border-green-500 text-green-600">
                    Active
                  </Badge>
                )}
                <Switch
                  checked={desktopSettings.enabled}
                  onCheckedChange={toggleEnabled}
                  disabled={permissionState === "denied"}
                  data-testid="switch-desktop-notifications"
                />
              </div>
            </div>

            {permissionState === "denied" && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-sm text-muted-foreground">
                <BellOff className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p>Desktop notifications are blocked by your browser. To enable them, click the lock icon in your browser's address bar and allow notifications for this site.</p>
              </div>
            )}

            {desktopSettings.enabled && (
              <>
                <Separator />
                <div className="ps-6 space-y-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notify me about</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Status Changes</Label>
                      <p className="text-sm text-muted-foreground">When a request moves to a new step or gets approved/rejected</p>
                    </div>
                    <Switch
                      checked={desktopSettings.statusChanges}
                      onCheckedChange={(v) => updateSetting("statusChanges", v)}
                      data-testid="switch-desktop-status-changes"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Assignments</Label>
                      <p className="text-sm text-muted-foreground">When you are assigned to act on a workflow step</p>
                    </div>
                    <Switch
                      checked={desktopSettings.assignments}
                      onCheckedChange={(v) => updateSetting("assignments", v)}
                      data-testid="switch-desktop-assignments"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Messages & Mentions</Label>
                      <p className="text-sm text-muted-foreground">When someone sends you a message or mentions you</p>
                    </div>
                    <Switch
                      checked={desktopSettings.messages}
                      onCheckedChange={(v) => updateSetting("messages", v)}
                      data-testid="switch-desktop-messages"
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Appearance
            </CardTitle>
            <CardDescription>Customize the look and feel</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Theme</Label>
                <p className="text-sm text-muted-foreground">Choose your preferred theme</p>
              </div>
              <Select defaultValue="system">
                <SelectTrigger className="w-[180px]" data-testid="select-theme">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Compact Mode</Label>
                <p className="text-sm text-muted-foreground">Use smaller spacing and elements</p>
              </div>
              <Switch data-testid="switch-compact-mode" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Security
            </CardTitle>
            <CardDescription>Account security settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Session Timeout (minutes)</Label>
              <Input
                type="number"
                defaultValue="30"
                className="w-[180px]"
                data-testid="input-session-timeout"
              />
              <p className="text-sm text-muted-foreground">Auto logout after inactivity</p>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Two-Factor Authentication</Label>
                <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
              </div>
              <Button variant="outline" data-testid="button-enable-2fa">Enable</Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" data-testid="button-reset-settings">Reset to Defaults</Button>
          <Button data-testid="button-save-settings">Save Changes</Button>
        </div>
      </div>
    </div>
  );
}
