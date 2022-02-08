import { getMinimumInfraForApi } from "@infra/lib";

const versionMapJson = {
  "0.5.5": "0.0.54",
  "1.4.2": "0.3.0",
  "1.5.0": "0.3.1",
};

describe("infra lib", () => {
  describe("getMinimumInfraForApi version utility", () => {
    it("finds exact version", () => {
      const infra = getMinimumInfraForApi(versionMapJson, "1.4.2");
      expect(infra).toEqual("0.3.0");
    });
    it("gives last version for unlisted outside range", () => {
      const infra = getMinimumInfraForApi(versionMapJson, "2.0.0");
      expect(infra).toEqual("0.3.1");
    });
    it("finds unlisted version in middle", () => {
      const infra = getMinimumInfraForApi(versionMapJson, "1.4.9");
      expect(infra).toEqual("0.3.0");
    });
    it("finds custom beta version in middle", () => {
      const infra = getMinimumInfraForApi(versionMapJson, "1.4.9-dev.wilson-3");
      expect(infra).toEqual("0.3.0");
    });
    it("returns first version for version under first", () => {
      const infra = getMinimumInfraForApi(versionMapJson, "0.0.8");
      expect(infra).toEqual("0.0.54");
    });
  });
});
