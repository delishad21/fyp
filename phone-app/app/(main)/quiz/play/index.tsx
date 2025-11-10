import {
  isBasic,
  isCrossword,
  isRapid,
  type AttemptSpec,
} from "@/src/api/quiz-service";
import { useSession } from "@/src/auth/session";
import QuizPlayBasicScreen from "@/src/components/quiz-components/quiz/QuizPlayBasicScreen";
import QuizPlayCrosswordScreen from "@/src/components/quiz-components/quiz/QuizPlayCrosswordScreen";
import QuizPlayRapidScreen from "@/src/components/quiz-components/quiz/QuizPlayRapidScreen";
// import QuizPlayCrosswordScreen from "@/src/components/screens/quiz/QuizPlayCrosswordScreen";
import { useAttemptCache } from "@/src/services/attempt-cache";
import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

export default function QuizPlayCoordinator() {
  const { attemptId, quizType } = useLocalSearchParams<{
    attemptId: string;
    quizType: "basic" | "rapid" | "crossword";
  }>();

  // ensure session is initialized
  useSession((s) => s.token());

  const cached = useAttemptCache((s) =>
    attemptId ? s.get(String(attemptId)) : undefined
  );

  // We expect the cache to be populated by QuizStartScreen before navigation.
  const payload = cached;
  const error: string | null = null;
  const loading = !payload;

  if (!attemptId || !quizType) {
    return (
      <Centered>
        <Text>Missing navigation params.</Text>
      </Centered>
    );
  }

  if (error) {
    return (
      <Centered>
        <Text>{error}</Text>
      </Centered>
    );
  }

  if (loading) {
    return (
      <Centered>
        <Text>Loading…</Text>
      </Centered>
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
        <Text>Unsupported quiz type.</Text>
      </Centered>
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      {children}
    </View>
  );
}
