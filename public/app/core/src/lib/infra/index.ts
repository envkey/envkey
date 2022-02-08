import { secureRandomAlphanumeric } from "../crypto/utils";

export const generateDeploymentTag = () =>
  secureRandomAlphanumeric(10).toLowerCase();
export const generateSubdomain = () =>
  secureRandomAlphanumeric(6).toLowerCase();
