import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");

  const handleSave = () => {
    // Save settings to localStorage or API
    localStorage.setItem("appSettings", JSON.stringify({ companyName, email }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your application settings
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input
              id="company-name"
              placeholder="Your company name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              data-testid="input-company-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-settings-email"
            />
          </div>
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-settings"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              data-testid="button-save-settings"
            >
              Save Settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
