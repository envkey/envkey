import React from "react";
import * as fonts from "./fonts";
import * as colors from "./colors";
import { color } from "csx";

export const BaseStyles = () => {
  return (
    <style
      key="base-styles"
      dangerouslySetInnerHTML={{
        __html: `            
            html, body {
              overflow-x: hidden;              
            }
            html.loaded {
              background: #fff;
            }
            body, body * {
              font-family: ${fonts.MAIN};
              color: ${colors.DARK_TEXT};
              outline-style: none;
              line-height: 1.5;
            }
            ul {
              list-style: none;
              margin: 0;
              padding: 0;
            }
            a, a:visited {
              text-decoration: none;
              color: inherit;
            }
            h1, h2, h3, h4, h5, h6 {
              margin: 0;
              padding: 0;
            }
            h1, h2, h3, h4, h5, h6, a, button, label, strong, small, p, span, svg, img {
              user-select: none;
              -webkit-user-drag: none;
            }
            .has-tooltip {
              position: relative;
            }
            .has-tooltip span.tooltip {
              position: absolute;
              top: 100%;
              left: 50%;
              transform: translateX(-50%);
              background: ${color("#fff").darken(0.12).toString()};
              color: rgba(0,0,0,0.5) !important;
              padding: 6px 12px;
              font-size: 12.5px !important;
              font-weight: 400 !important;
              opacity: 0;
              white-space: nowrap;
              z-index: 10;
              pointer-events: none;
              box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.15);
              transition: "opacity";
              transition-duration: "0.2s";
              text-transform: none !important;
            }
            .has-tooltip:hover .tooltip {
              opacity: 1;
            }
          `,
      }}
    />
  );
};
