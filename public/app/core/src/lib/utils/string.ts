export const capitalize = (s: string): string =>
    s.charAt(0).toUpperCase() + s.slice(1),
  shortNum = (n: number): string => {
    if (n > 1000) {
      return `${parseFloat((n / 1000).toFixed(1))}k`;
    } else if (n > 1000000) {
      return `${parseFloat((n / 1000000).toFixed(1))}m`;
    } else if (n > 1000000000) {
      return `${parseFloat((n / 1000000000).toFixed(1))}b`;
    } else {
      return n.toString();
    }
  },
  isMultiline = (s: string, columnWidth = 326.5): boolean => {
    return s.length > columnWidth / 8.1625 || s.split(/[\r\n]+/).length > 1;
  };
