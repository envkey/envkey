import { Billing } from "../types";
import * as R from "ramda";

export const planForNumUsers = (
  products: Billing.Product[],
  numUsers: number,
  ssoEnabled?: boolean
): { product: Billing.Product; quantity: number } | undefined => {
  if (products.length == 0) {
    return undefined;
  }

  let product: Billing.Product;
  let quantity = 1;

  const sortedByMaxUsers = R.sortBy(
    R.prop("maxUsers"),
    products
  ) as Billing.Product[];

  let i = 0;
  let currentProduct: Billing.Product;
  while (true) {
    currentProduct = sortedByMaxUsers[i];

    if (
      currentProduct.maxUsers * quantity < numUsers ||
      (ssoEnabled && !currentProduct.ssoEnabled)
    ) {
      if (currentProduct.plan == "business_cloud") {
        quantity += 1;
      } else {
        i++;
      }
    } else {
      product = currentProduct;
      break;
    }
  }

  return { product, quantity };
};
