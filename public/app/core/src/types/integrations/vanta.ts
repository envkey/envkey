export const VANTA_CLIENT_ID =
  process.env.NODE_ENV == "development"
    ? "vci_82a4a9fc47c135c7628239934e1cd68ee6c31b3a94aa4ddf"
    : "vci_2ccb14b25b2f72368317ce98cf81041a2941f2b59a0a72be";

export const VANTA_REDIRECT_URI =
  process.env.NODE_ENV == "development"
    ? "http://localhost:3000/integrations/vanta/oauth"
    : "https://api-v2-staging.envkey.com/integrations/vanta/oauth";
