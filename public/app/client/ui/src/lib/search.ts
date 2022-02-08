import * as R from "ramda";
import Fuse from "fuse.js";

const FUZZY_MATCH_THRESHOLD = 0.4;

type SearchItem = { id: string; [k: string]: any };

export const fuzzySearch = <T extends SearchItem>(params: {
  items: T[];
  filter: string;
  textField?: keyof T;

  fuseIndex?: ReturnType<typeof Fuse.createIndex>;
  indexById?: Record<string, number>;

  additionalSortFns?: ((
    a: Fuse.FuseResult<T>,
    b: Fuse.FuseResult<T>
  ) => number)[];
}): {
  searchRes: Fuse.FuseResult<T>[];
  items: T[];
} => {
  const { items } = params;
  const filter = params.filter.trim().toLowerCase();
  const textField = params.textField ?? "text";

  if (!filter) {
    return {
      searchRes: [],
      items,
    };
  }

  const fuseIndex =
    params.fuseIndex ?? Fuse.createIndex([textField as string], items);

  let indexById = params.indexById ?? {};
  if (!params.indexById) {
    items.forEach(({ id }, i) => (indexById[id] = i));
  }

  let searchRes = new Fuse<T>(
    items,
    {
      keys: [textField as string],
      threshold: FUZZY_MATCH_THRESHOLD,
      includeScore: true,
    },
    fuseIndex
  ).search(filter);

  searchRes = R.sortWith(
    [
      R.ascend((res) => {
        // modify score so exact matches go first, then
        // then matches that start with filter,
        // then matches with internal words that start with filter
        // then matches by match index
        // then fuzzy score for non-matches

        const text = res.item[textField]!.toLowerCase();
        if (text == filter) {
          return -1;
        }
        const idx = text.indexOf(filter);
        if (idx == 0) {
          return 0;
        } else if (idx > 0) {
          const split = wordSplit(text);
          const splitIdx = split.findIndex((word) => word.indexOf(filter) == 0);
          return splitIdx == -1 ? 1000 + idx : splitIdx;
        } else {
          return 1000 + res.item[textField]!.length + res.score!;
        }
      }),

      ...(params.additionalSortFns ?? []),

      R.ascend((res) => indexById[res.item.id]),
    ],
    searchRes
  ).map((res, i) => ({ ...res, refIndex: i }));

  // if whole text OR an internal word begins with filter,
  // filter out any nodes where the text and no internal word begins with filter
  if (searchRes.length > 0) {
    const text = searchRes[0].item[textField]!.toLowerCase();
    const hit =
      text.startsWith(filter) ||
      R.any((s) => s.startsWith(filter), wordSplit(text));

    if (hit) {
      searchRes = searchRes.filter(({ item }) => {
        const eachLabel = item[textField]!.toLowerCase();
        if (hit) {
          return (
            eachLabel.startsWith(filter) ||
            R.any((s) => s.startsWith(filter), wordSplit(eachLabel))
          );
        }
        return true;
      });
    }
  }

  return {
    searchRes,
    items: searchRes.map(R.prop("item")),
  };
};

const wordSplit = (s: string) => s.split(/[^a-zA-Z\d]+/);
