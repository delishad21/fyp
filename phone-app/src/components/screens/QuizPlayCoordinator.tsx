import {
  isBasic,
  isCrossword,
  isRapid,
  type AttemptSpec,
} from "@/src/api/quiz-service";
import { useSession } from "@/src/auth/session";
import QuizPlayBasicScreen from "@/src/components/quiz-components/quiz/play/QuizPlayBasicScreen";
import QuizPlayCrosswordScreen from "@/src/components/quiz-components/quiz/play/QuizPlayCrosswordScreen";
import QuizPlayRapidScreen from "@/src/components/quiz-components/quiz/play/QuizPlayRapidScreen";
import { useAttemptCache } from "@/src/services/attempt-cache";
import { useTheme } from "@/src/theme";
import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function QuizPlayCoordinator() {
  const { attemptId, quizType } = useLocalSearchParams<{
    attemptId: string;
    quizType: "basic" | "rapid" | "crossword";
  }>();

  // ensure session is initialized
  useSession((s) => s.token());

  const { colors } = useTheme();

  const cached = useAttemptCache((s) =>
    attemptId ? s.get(String(attemptId)) : undefined
  );

  const payload = cached;
  const error: string | null = null;
  const loading = !payload;

  if (!attemptId || !quizType) {
    return (
      <>
        <Stack.Screen options={{ title: "Quiz" }} />
        <Centered>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Missing navigation params
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Please go back and start the quiz again.
          </Text>
        </Centered>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: "Quiz" }} />
        <Centered>
          <Text style={[styles.title, { color: colors.error }]}>Error</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {error}
          </Text>
        </Centered>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Centered>
          <ActivityIndicator color={colors.primary} />
          <Text
            style={[styles.sub, { color: colors.textSecondary, marginTop: 10 }]}
          >
            Loading quiz…
          </Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            If this takes too long, go back and try again.
          </Text>
        </Centered>
      </>
    );
  }

  const spec = payload!.spec as AttemptSpec;

  if (isBasic(spec)) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <QuizPlayBasicScreen
          attemptId={String(attemptId)}
          spec={spec}
          attempt={payload?.attempt}
        />
      </>
    );
  }

  if (isRapid(spec)) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <QuizPlayRapidScreen
          attemptId={String(attemptId)}
          spec={spec}
          attempt={payload?.attempt}
        />
      </>
    );
  }

  if (isCrossword(spec)) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <QuizPlayCrosswordScreen
          attemptId={String(attemptId)}
          spec={spec}
          attempt={payload?.attempt}
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Quiz" }} />
      <Centered>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Unsupported quiz type
        </Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          This quiz type isn’t supported on this screen yet.
        </Text>
      </Centered>
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.center,
        {
          backgroundColor: colors.bg1,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 18,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  sub: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  hint: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2,
    opacity: 0.9,
  },
});
