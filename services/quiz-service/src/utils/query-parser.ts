export function parseStringArrayParam(input: unknown): string[] | undefined {
  if (input == null) return undefined;

  if (Array.isArray(input)) {
    // handles string[] or ParsedQs[]
    return input
      .flatMap((v) =>
        typeof v === "string"
          ? v
          : typeof v === "object" && v
          ? Object.values(v).filter((x): x is string => typeof x === "string")
          : []
      )
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (typeof input === "string") {
    // support comma-separated (?subjects=Math,Science) and repeated (?subjects=Math&subjects=Science)
    return input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (typeof input === "object") {
    // handles qs style: subjects[0]=Math&subjects[1]=Science -> {0:"Math",1:"Science"}
    return Object.values(input)
      .filter((v): v is string => typeof v === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return undefined;
}
