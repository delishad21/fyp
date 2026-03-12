import { Platform } from "react-native";
import * as nativeSecure from "./secure.native";
import * as webSecure from "./secure.web";

const secureImpl = Platform.OS === "web" ? webSecure : nativeSecure;

export const setJSON = secureImpl.setJSON;
export const getJSON = secureImpl.getJSON;
export const del = secureImpl.del;
