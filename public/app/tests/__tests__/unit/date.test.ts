import { dateFromRelativeTime } from "@core/lib/utils/date";

describe("date utils", () => {
  describe("dateFromRelativeTime parser", () => {
    const relativeDate = new Date("2000-01-01T00:00:00Z");
    describe("regular datetime strings", () => {
      test("parses mm/dd/yyyy", () => {
        const d = dateFromRelativeTime("5/12/2010", relativeDate);
        expect(d?.toISOString()).toEqual("2010-05-12T00:00:00.000Z");
      });
      test("parses yyyy-mm-dd", () => {
        const d = dateFromRelativeTime("2009-02-09", relativeDate);
        expect(d?.toISOString()).toEqual("2009-02-09T00:00:00.000Z");
      });
      test("parses iso8601", () => {
        const input = "2020-08-26T23:19:42.596Z"
        const d = dateFromRelativeTime(input, relativeDate);
        expect(d?.toISOString()).toEqual(input);
      });
    });
    describe("relative parsers", () => {
      test("parses months", () => {
        const d = dateFromRelativeTime("2mo", relativeDate);
        expect(d?.toISOString()).toMatch("1999-11-01T");
      });
      test("parses days", () => {
        const d = dateFromRelativeTime("3d", relativeDate);
        expect(d?.toISOString()).toMatch("1999-12-29T");
      });
      test("parses hours", () => {
        const d = dateFromRelativeTime("15h", relativeDate);
        expect(d?.toISOString()).toMatch("1999-12-31T09:00");
      });
      test("parses minutes", () => {
        const d = dateFromRelativeTime("120m", relativeDate);
        expect(d?.toISOString()).toMatch("1999-12-31T22:00");
      });
      test("parses seconds", () => {
        const d = dateFromRelativeTime("300s", relativeDate);
        expect(d?.toISOString()).toMatch("1999-12-31T23:55");
      });
    })
  });
});
