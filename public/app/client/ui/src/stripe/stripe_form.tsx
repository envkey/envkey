import React, { useState } from "react";
import ReactDOM from "react-dom";
import { normalize, setupPage } from "csstips";
import * as styles from "@styles";
import { style } from "typestyle";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe, StripeError } from "@stripe/stripe-js";
import queryString from "query-string";
import { SmallLoader, SvgImage } from "@images";
import Client from "@core/types/client";

const STRIPE_PUBLISHABLE_KEY = {
  development: "pk_test_W3R0XmxGmhNmjmoQVItAm8Fa",
  production: "pk_live_1lUzZFF2v9Og55pKzBFgmpv8",
}[process.env.NODE_ENV as "development" | "production"];

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
loadStripe(STRIPE_PUBLISHABLE_KEY);

const StripeForm: React.FC = () => {
  const stripe = useStripe();
  const elements = useElements();

  const [stripeError, setStripeError] = useState<StripeError>();
  const [updating, setUpdating] = useState(false);

  const queryParams = queryString.parse(window.location.search) as {
    data: string;
  };

  const formData = JSON.parse(
    queryParams.data
  ) as Client.CloudBillingStripeFormParams;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setUpdating(true);

    if (!stripe || !elements) {
      // Stripe.js has not yet loaded.
      return;
    }

    const cardElement = elements.getElement("card");

    if (!cardElement) {
      return;
    }

    const res = await stripe.createToken(cardElement);
    if (res.token) {
      window.localStorage.setItem("stripe-token", res.token.id);
      window.localStorage.removeItem("stripe-token");
      window.close();
    } else if (res.error) {
      setStripeError(res.error);
    }
  };

  const renderError = () => {
    const { error: formDataError } = formData.data;
    if (!formDataError && !stripeError) return "";

    return (
      <p className="error">
        {stripeError?.message ?? formDataError} Please re-enter your card
        details.
      </p>
    );
  };

  return (
    <div className={styles.Billing + " stripe-form"}>
      <h3>
        <strong>Payment</strong> Method
      </h3>
      <form onSubmit={onSubmit}>
        {renderError()}
        <CardElement
          options={{
            style: {
              base: {
                fontFamily: "arial",
                fontSize: "16px",
              },
            },
          }}
          onReady={(element) => element.focus()}
        />
        <div className="field buttons">
          <button
            className="primary"
            disabled={!stripe || !elements || updating}
          >
            {updating ? <SmallLoader /> : "Save"}
          </button>
        </div>
      </form>

      <p>Secure, PCI-compliant billing provided by Stripe.</p>
      <div className="stripe-logo">
        <SvgImage
          type="powered-by-stripe"
          width={180 * 0.75}
          height={60 * 0.75}
        />
      </div>
    </div>
  );
};

normalize();
setupPage("#root");

ReactDOM.render(
  <div className={style({ width: "100%", height: "100%" })}>
    <styles.FontFaces />
    <styles.BaseStyles />
    <Elements stripe={stripePromise}>
      <StripeForm />
    </Elements>
  </div>,

  document.getElementById("root")
);
