import React from "react";

const FONTS = {
  "nimbus-sans-novus": {
    "200": "nimbus-sans-novus-light",
    "300": "nimbus-sans-novus-regular",
    "400": "nimbus-sans-novus-medium",
    "500": "nimbus-sans-novus-semibold",
  },
  "nimbus-sans-novus-condensed": {
    "200": "nimbus-sans-novus-cond-light",
    "300": "nimbus-sans-novus-cond-regular",
    "400": "nimbus-sans-novus-cond-medium",
    "500": "nimbus-sans-novus-cond-semibold",
    "600": "nimbus-sans-novus-cond-bold",
  },
};

export const FontFaces = () => {
  return (
    <style
      key="font-faces"
      dangerouslySetInnerHTML={{
        __html: `
            ${Object.entries(FONTS)
              .flatMap(([family, byWeight]) =>
                Object.entries(byWeight).map(
                  ([weight, path]) => `
                @font-face {
                  font-family: '${family}';
                  src: url(${FONT_REQUIRES[path]}) format('woff2');                  
                  font-weight: ${weight};
                  font-style: normal;
                  font-display: block;
                }
              `
                )
              )
              .join("\n")}
          `,
      }}
    />
  );
};

// static requires to ensure that webpack includes all the fonts we need
export const FONT_REQUIRES: Record<string, string> = {
  "nimbus-sans-novus-light": require("../fonts/nimbus-sans-novus-light.woff2")
    .default,

  "nimbus-sans-novus-medium": require("../fonts/nimbus-sans-novus-medium.woff2")
    .default,

  "nimbus-sans-novus-regular":
    require("../fonts/nimbus-sans-novus-regular.woff2").default,

  "nimbus-sans-novus-semibold":
    require("../fonts/nimbus-sans-novus-semibold.woff2").default,

  "nimbus-sans-novus-cond-light":
    require("../fonts/nimbus-sans-novus-cond-light.woff2").default,

  "nimbus-sans-novus-cond-medium":
    require("../fonts/nimbus-sans-novus-cond-medium.woff2").default,

  "nimbus-sans-novus-cond-regular":
    require("../fonts/nimbus-sans-novus-cond-regular.woff2").default,

  "nimbus-sans-novus-cond-semibold":
    require("../fonts/nimbus-sans-novus-cond-semibold.woff2").default,

  "nimbus-sans-novus-cond-bold":
    require("../fonts/nimbus-sans-novus-cond-bold.woff2").default,
};
