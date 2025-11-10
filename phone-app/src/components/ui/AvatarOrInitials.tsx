import React, { useMemo, useState } from "react";
import { Image, Text, View } from "react-native";

function nameInitials(fullName?: string) {
  if (!fullName) return "?";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export default function AvatarOrInitials({
  uri,
  name,
  size = 40,
  bgFallback,
  textColor = "#fff",
  borderColor,
  borderWidth = 0,
}: {
  uri?: string | null;
  name: string;
  size?: number;
  bgFallback: string;
  textColor?: string;
  borderColor?: string;
  borderWidth?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initials = useMemo(() => nameInitials(name), [name]);
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (!uri || failed) {
    return (
      <View
        style={[
          {
            backgroundColor: bgFallback,
            alignItems: "center",
            justifyContent: "center",
            borderWidth,
            borderColor: borderColor ?? "transparent",
          },
          dim,
        ]}
      >
        <Text style={{ color: textColor, fontWeight: "700" }}>{initials}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[dim, { backgroundColor: bgFallback, borderWidth, borderColor }]}
      onError={() => setFailed(true)}
    />
  );
}
