import { Stack } from "expo-router";
export default function QuizStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[quizId]/start" />
    </Stack>
  );
}
