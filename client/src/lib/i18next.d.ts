import type { defaultNS } from "@shared/i18n";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    returnNull: false;
    returnObjects: false;
  }
}
