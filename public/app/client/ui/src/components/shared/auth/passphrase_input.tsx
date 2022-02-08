import React, { useState, useRef, useEffect } from "react";
import { validatePassphrase } from "@core/lib/crypto/utils";

type Props = {
  required?: true;
  confirm?: true;
  validateStrength?: true;
  focus?: true;
  placeholder?: string;
  disabled?: boolean;
  strengthInputs?: string[];
  reset?: true;
  onChange: (valid: boolean, val?: string) => void;
};

export const PassphraseInput: React.FC<Props> = (props) => {
  const [mainInputValid, setMainInputValid] = useState(false);
  const [pending, setPending] = useState<string>("");
  const [confirmVal, setConfirmVal] = useState<string>("");
  const [invalidMsg, setInvalidMsg] = useState<string>("");

  useEffect(() => {
    if (props.reset) {
      setPending("");
      setConfirmVal("");
      setMainInputValid(false);
    }
  }, [props.reset]);

  const validateChange = () => {
    let valid: boolean;

    if ((!pending && !props.required) || !props.validateStrength) {
      setMainInputValid(true);
      setInvalidMsg("");
      valid = true;
    } else {
      const validRes = validatePassphrase(pending ?? "");
      if (validRes !== true) {
        setMainInputValid(false);
        valid = false;
        setInvalidMsg(validRes);
      } else if (props.confirm && confirmVal !== pending) {
        setMainInputValid(true);
        valid = false;
        if (confirmVal && confirmVal.length >= 10) {
          setInvalidMsg("Confirmation doesn't match.");
        } else {
          setInvalidMsg("");
        }
      } else {
        setMainInputValid(true);
        setInvalidMsg("");
        valid = true;
      }
    }

    props.onChange(valid, valid ? pending : undefined);
  };

  useEffect(validateChange, [pending, confirmVal, props.required]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPending(e.target.value);
  };

  const onConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmVal(e.target.value);
  };

  const mainInput = (
    <input
      value={pending}
      onChange={onInputChange}
      disabled={props.disabled}
      type="password"
      placeholder={props.placeholder || "Device passphrase (10-256 characters)"}
      pattern=".{10,256}"
      required={props.required}
      autoFocus={props.focus}
    />
  );

  const renderConfirm = () => {
    if (props.confirm) {
      return (
        <input
          value={confirmVal}
          onChange={onConfirmChange}
          disabled={props.disabled || !mainInputValid}
          type="password"
          placeholder="Confirm passphrase"
          pattern=".{10,256}"
          required={props.required}
        />
      );
    }
  };

  const renderInvalid = () => {
    if (invalidMsg) {
      return <p className="error">{invalidMsg}</p>;
    }
  };

  return (
    <div>
      {mainInput}
      {renderConfirm()}
      {renderInvalid()}
    </div>
  );
};
