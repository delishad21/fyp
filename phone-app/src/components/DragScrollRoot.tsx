import React, { PropsWithChildren } from "react";
import { Platform } from "react-native";
import DragScrollRootNative from "./DragScrollRoot.native";
import DragScrollRootWeb from "./DragScrollRoot.web";

export default function DragScrollRoot(props: PropsWithChildren) {
  if (Platform.OS === "web") {
    return <DragScrollRootWeb {...props} />;
  }
  return <DragScrollRootNative {...props} />;
}
