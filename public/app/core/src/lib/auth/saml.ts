export const samlIdpHasMinimumSettings = (samlSettings: {
  identityProviderEntityId?: string;
  identityProviderLoginUrl?: string;
  identityProviderX509Certs?: string[];
}): boolean => {
  return Boolean(
    samlSettings.identityProviderEntityId &&
      samlSettings.identityProviderX509Certs &&
      samlSettings.identityProviderX509Certs.length > 0 &&
      samlSettings.identityProviderLoginUrl
  );
};
