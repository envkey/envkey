export const wait = (waitMillis: number) =>
  new Promise<void>((resolve) => setTimeout(() => resolve(), waitMillis));
export const upTo1Sec = () => Math.ceil(Math.random() * 1000);
