import { ElectronWindow } from "@core/types/electron";
import Client from "@core/types/client";

declare var window: ElectronWindow;

export const updatePaymentSource = async (
  params: Client.CloudBillingStripeFormParams
): Promise<string | undefined> =>
  new Promise((resolve) => {
    const receiveToken = (e: StorageEvent) => {
      let token: string | undefined;
      if (e.key == "stripe-token" && e.newValue) {
        token = e.newValue;
      }
      window.removeEventListener("storage", receiveToken);
      window.electron.closeStripeForm();

      resolve(token);
    };
    window.addEventListener("storage", receiveToken);

    window.electron.openStripeForm(params);

    const closeHandler = () => {
      window.electron.deregisterCloseStripeFormHandler(closeHandler);
      resolve(undefined);
    };
    window.electron.registerCloseStripeFormHandler(closeHandler);
  });
