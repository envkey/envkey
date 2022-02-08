import { pick } from "@core/lib/utils/pick";
import { LocalUiState } from "@ui_types";
import { useLayoutEffect, useEffect, useState } from "react";

export const isElementInViewport = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();

  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= document.documentElement.clientHeight &&
    rect.right <= document.documentElement.clientWidth
  );
};

let updatingSize = false;
let queuedUpdate = false;

export const useWindowSize = (uiState: LocalUiState) => {
  const root = document.querySelector("#root")!;

  const initialRect = root.getBoundingClientRect();

  const [size, setSize] = useState([initialRect.width, initialRect.height]);

  const updateSize = () => {
    if (updatingSize) {
      queuedUpdate = true;
      return;
    }

    const rect = root.getBoundingClientRect();

    if (rect.width != size[0] || rect.height != size[1]) {
      updatingSize = true;
      setSize([rect.width, rect.height]);
      requestAnimationFrame(() => {
        updatingSize = false;
        if (queuedUpdate) {
          queuedUpdate = false;
          updateSize();
        }
      });
    }
  };

  useLayoutEffect(() => {
    updateSize();
    window.addEventListener("resize", updateSize);

    for (let i = 1; i < 10; i++) {
      setTimeout(updateSize, i * 1000);
    }

    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  return size;
};
