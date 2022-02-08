import * as z from "zod";

export type UnionType<T extends z.ZodTypeAny> = z.ZodUnion<[T, T, ...T[]]>;

type ObjectUnion<T extends {} = {}> = UnionType<z.ZodObject<T>>;
type ObjectOrObjectUnion<T extends {} = {}> = z.ZodObject<T> | ObjectUnion<T>;

type ObjectLikeUnion<T extends {} = {}> = UnionType<
  ObjectOrObjectUnion<T> | z.ZodIntersection<ObjectLike<T>, ObjectLike<T>>
>;

type ObjectLikeOrObjectLikeUnion<T extends {} = {}> =
  | ObjectLike<T>
  | ObjectLikeUnion<T>;

type Union<T extends {} = {}> =
  | ObjectLikeUnion<T>
  | z.ZodUnion<[Union, Union, ...Union[]]>;

type ObjectLike<T extends {} = {}> =
  | ObjectOrObjectUnion<T>
  | Union<T>
  | z.ZodIntersection<ObjectLike<T>, ObjectLike<T>>;

export const ZodLiteralRecord = <
    KeyType extends string,
    ZodValueType extends z.ZodTypeAny
  >(
    keys: KeyType[],
    zodValueType: ZodValueType
  ) =>
    z.object(
      keys.reduce(
        (agg, k) => ({
          ...agg,
          [k]: zodValueType.optional(),
        }),
        {} as Record<KeyType, z.ZodUnion<[ZodValueType, z.ZodUndefined]>>
      )
    ),
  zodPrimitive = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.undefined(),
    z.null(),
  ]),
  flatten = <T extends ObjectLike>(schema: T) => {
    let res: any;

    if (schema._def.t == "union") {
      let schemas: [any, any, ...any[]] = [] as any;

      for (let opt of schema._def.options) {
        if (opt._def.t == "union") {
          schemas = [...schemas, flatten(opt as any)] as any;
        } else {
          schemas.push(opt);
        }
      }

      res = z.union(schemas);
    } else {
      res = schema;
    }

    return res as ObjectLikeOrObjectLikeUnion<T>;
  },
  intersection = <T extends ObjectLike, U extends ObjectLike>(
    left: T,
    right: U
  ) => {
    /*
      recursively merges object-like/unions of object-like
      see https://github.com/vriad/zod/issues/59
    */
    let res: any;

    if (left._def.t == "object" && right._def.t == "object") {
      res = (left as z.ZodObject<{}>).merge(right as z.ZodObject<{}>);
    } else {
      const leftFlat = flatten(left),
        rightFlat = flatten(right),
        schemas: [any, any, ...any[]] = [] as any;

      if (leftFlat._def.t == "union") {
        for (let leftOpt of leftFlat._def.options) {
          if (rightFlat._def.t == "union") {
            for (let rightOpt of rightFlat._def.options) {
              schemas.push((intersection as any)(leftOpt, rightOpt));
            }
          } else {
            schemas.push((intersection as any)(leftOpt, rightFlat));
          }
        }
      } else if (rightFlat._def.t == "union") {
        for (let rightOpt of rightFlat._def.options) {
          schemas.push((intersection as any)(leftFlat, rightOpt));
        }
      }

      res = z.union(schemas);
    }

    return res as z.ZodIntersection<T, U>;
  };

export type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;
