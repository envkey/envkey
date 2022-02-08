import { Client } from "@core/types";
import { ComponentProps } from "@ui_types";

export const dispatchDeviceSecurity = async (
  dispatch: ComponentProps["dispatch"],
  passphrase?: string,
  lockoutMs?: number
) => {
  if (passphrase) {
    await dispatch({
      type: Client.ActionType.SET_DEVICE_PASSPHRASE,
      payload: { passphrase },
    });
  }

  if (typeof lockoutMs == "number") {
    await dispatch({
      type: Client.ActionType.SET_DEVICE_LOCKOUT,
      payload: { lockoutMs },
    });
  }
};
