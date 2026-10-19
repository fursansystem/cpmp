import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Settings, Globe, Bell, Shield, Palette, Monitor, BellOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ProfileForm } from "@/components/profile-form";
import { useDesktopNotifications } from "@/hooks/use-desktop-notifications";

export default function SettingsPage() {
  const { user } = useAuth();
  const { settings: desktopSettings, permissionState, toggleEnabled, updateSetting } = useDesktopNotifications();

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
                <Label>Language</Label>
                <p className="text-sm text-muted-foreground">Select your preferred language</p>
              </div>
              <Select defaultValue="en">
                <SelectTrigger className="w-[180px]" data-testid="select-language">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>RTL Support</Label>
                <p className="text-sm text-muted-foreground">Enable right-to-left text direction</p>
              </div>
              <Switch data-testid="switch-rtl" />
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
                <div className="pl-6 space-y-4">
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
