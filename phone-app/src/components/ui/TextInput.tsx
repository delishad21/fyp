import { useTheme } from "@/src/theme";
import React, { forwardRef, useMemo, useState } from "react";
import {
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

type Props = Omit<RNTextInputProps, "onChange" | "editable"> & {
  label?: string;
  error?: string | string[];
  id?: string; // used as nativeID for a11y
  readOnly?: boolean;
  onValueChange?: (value: string) => void; // fires with new string value
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
};

/**
 * Themed TextInput with label + error display.
 * - readOnly -> sets editable={false}
 * - onValueChange(value) mirrors web API and works alongside onChangeText
 * - Focus ring simulated via border color change
 */
const TextInput = forwardRef<RNTextInput, Props>(function TextInput(
  {
    label,
    error,
    id,
    readOnly,
    onChangeText,
    onValueChange,
    containerStyle,
    inputStyle,
    placeholderTextColor,
    keyboardType = "default",
    ...rest
  },
  ref
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const errors = useMemo(
    () => (Array.isArray(error) ? error : error ? [error] : []),
    [error]
  );

  // unify change handlers
  function handleChangeText(value: string) {
    onChangeText?.(value);
    onValueChange?.(value);
  }

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { gap: 6 },
        label: { fontSize: 15, color: colors.textPrimary },
        input: {
          borderWidth: 1,
          borderRadius: 6,
          paddingVertical: 12,
          paddingHorizontal: 16,
          backgroundColor: colors.bg2,
          borderColor: focused ? colors.primary : colors.bg4,
          color: colors.textPrimary,
          fontSize: 15,
        },
        errorText: { fontSize: 12, color: colors.error, marginTop: 4 },
        errorList: { marginTop: 4, paddingLeft: 16, gap: 2 },
        errorItem: { fontSize: 12, color: colors.error },
      }),
    [colors, focused]
  );

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <Text nativeID={id ? `${id}-label` : undefined} style={styles.label}>
          {label}
        </Text>
      ) : null}

      <RNTextInput
        ref={ref}
        nativeID={id}
        accessible
        accessibilityLabel={label}
        editable={!readOnly}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={placeholderTextColor ?? "#9CA3AF"}
        keyboardType={keyboardType}
        style={[styles.input, inputStyle]}
        {...rest}
      />

      {errors.length === 1 ? (
        <Text style={styles.errorText}>{errors[0]}</Text>
      ) : null}

      {errors.length > 1 ? (
        <View style={styles.errorList}>
          {errors.map((msg, i) => (
            <Text key={i} style={styles.errorItem}>
              • {msg}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
});

export default TextInput;
