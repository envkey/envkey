import React, { useLayoutEffect } from "react";
import { EnvkeyLogo } from "@images";
import * as styles from "@styles";

export const HomeContainer: React.FC<{
  anchor?: "top" | "center";
  overlay?: true;
}> = (props) => {
  useLayoutEffect(() => {
    document.body.scrollTo(0, 0);
  }, [window.location.hash]);

  useLayoutEffect(() => {
    if (!document.documentElement.classList.contains("loaded")) {
      document.documentElement.classList.add("loaded");
    }
  }, []);

  return (
    <div
      className={
        styles.HomeContainer +
        ` anchor-${props.anchor ?? "top"} ${props.overlay ? "overlay" : ""}`
      }
    >
      <div>
        <div>
          <EnvkeyLogo scale={1.66} />
          <div className="home-content">{props.children}</div>
        </div>
      </div>
    </div>
  );
};
