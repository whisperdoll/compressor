type Key = string | number | symbol;

export default class Dict {
  static fromArray<KeyType extends Key, ValueType>(
    arr: [KeyType, ValueType][]
  ): Record<KeyType, ValueType> {
    const ret: Record<KeyType, ValueType> = {} as Record<KeyType, ValueType>;
    arr.forEach(([key, value]) => {
      ret[key] = value;
    });

    return ret;
  }

  static zip<
    K extends string,
    T1 extends Record<string, any>,
    T2 extends Record<string, any>
  >(o1: Record<K, T1>, o2: Record<K, T2>): Record<K, T1 & T2> {
    const allKeys = Array.from(
      new Set<K>([...(Object.keys(o1) as K[]), ...(Object.keys(o2) as K[])])
    );

    return Dict.fromArray(allKeys.map((k) => [k, { ...o1[k], ...o2[k] }]));
  }

  static map<K extends Key, V, K2 extends Key, V2>(
    o: Record<K, V>,
    fn: (key: K, value: V) => [K2, V2]
  ): Record<K2, V2> {
    return Dict.fromArray(
      (Object.entries(o) as [K, V][]).map(([key, value]) => fn(key, value))
    );
  }

  static map2<O extends Record<Key, any>, T>(
    o: O,
    fn: (key: keyof O, value: O[typeof key]) => T
  ): T[] {
    return Object.entries(o).map(([key, value]) => fn(key, value));
  }

  static transformedValues<K extends Key, OriginalValue, TransformedValue>(
    o: Record<K, OriginalValue>,
    fn: (value: OriginalValue, key: K) => TransformedValue
  ): Record<K, TransformedValue> {
    const ret = {} as Record<K, TransformedValue>;

    (Object.entries(o) as [K, OriginalValue][]).forEach(([key, value]) => {
      ret[key] = fn(value, key);
    });

    return ret;
  }

  static merge<T extends Record<string | symbol | number, unknown>>(
    os: T[]
  ): T {
    const ret = {};
    os.forEach((o) => Object.assign(ret, o));
    return ret as T;
  }

  static without<T extends Record<Key, unknown>, K extends keyof T>(
    obj: T,
    keys: K[]
  ): Omit<T, K> {
    const _ = { ...obj };
    keys.forEach((key) => delete _[key]);
    return _;
  }

  static slice<T extends Record<Key, unknown>, K extends keyof T>(
    obj: T,
    keys: K[]
  ): Pick<T, K> {
    const _: Partial<Pick<T, K>> = {};
    keys.forEach((key) => (_[key] = obj[key]));
    return _ as Pick<T, K>;
  }
}
