interface FlagContext {
  userId: string;
  defaultValue?: boolean;
}

const inMemoryFlags = new Map<string, boolean>();

export async function isFeatureEnabled(flagKey: string, ctx: FlagContext): Promise<boolean> {
  if (inMemoryFlags.has(flagKey)) {
    return inMemoryFlags.get(flagKey)!;
  }
  return ctx.defaultValue ?? false;
}

export function setFlag(flagKey: string, value: boolean) {
  inMemoryFlags.set(flagKey, value);
}
