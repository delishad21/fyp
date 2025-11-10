import { AttemptDoc } from "@/src/api/quiz-service";
import { Center } from "@/src/components/ui/Center";
import { useTheme } from "@/src/theme";
import { ActivityIndicator, Text } from "react-native";
import BasicAttemptViewer from "./BasicAttemptViewer";
import CrosswordAttemptViewer from "./CrosswordAttemptViewer";
import RapidAttemptViewer from "./RapidAttemptViewer";

export function AttemptBody({
  quizType,
  attemptDoc,
  loadingAttempt,
}: {
  quizType: AttemptDoc["quizVersionSnapshot"]["quizType"] | undefined;
  attemptDoc: AttemptDoc | null;
  loadingAttempt: boolean;
}) {
  const { colors } = useTheme();

  if (attemptDoc) {
    if (quizType === "basic") return <BasicAttemptViewer doc={attemptDoc} />;
    if (quizType === "rapid") return <RapidAttemptViewer doc={attemptDoc} />;
    if (quizType === "crossword")
      return <CrosswordAttemptViewer doc={attemptDoc} />;

    // Fallback when we have a doc but no matching viewer
    return (
      <Center>
        <Text style={{ color: colors.textSecondary }}>
          Viewer for “{quizType || "unknown"}” not implemented yet.
        </Text>
      </Center>
    );
  }

  if (loadingAttempt) {
    return (
      <Center>
        <ActivityIndicator color={colors.primary} />
      </Center>
    );
  }

  return (
    <Center>
      <Text style={{ color: colors.textSecondary }}>Select an attempt.</Text>
    </Center>
  );
}
