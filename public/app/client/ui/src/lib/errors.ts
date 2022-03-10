export const logAndAlertError = (msg: string, err?: any) => {
  console.error(msg, err);
  alert(
    msg +
      "\n\nGo to View > Toggle Developer Tools > Console for more details on the error."
  );
};
