import { useRef, useState } from "react";
import type {
  DragData,
  ScheduleItem,
} from "@/services/class/types/class-types";

export function useDragState() {
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [previewById, setPreviewById] = useState<
    Record<string, Partial<ScheduleItem>>
  >({});

  const resizeStateRef = useRef<{
    clientId: string;
    _id?: string;
    quizId: string;
    direction: "left" | "right";
    originalItem: ScheduleItem;
    lastValidDayId?: string;
  } | null>(null);

  const anchorOffsetDaysRef = useRef<number>(0);
  const lastPointerZoneRef = useRef<{
    insideCalendar: boolean;
    day: string | null;
    isPast: boolean;
  }>({ insideCalendar: false, day: null, isPast: false });

  return {
    activeDrag,
    setActiveDrag,
    previewById,
    setPreviewById,
    resizeStateRef,
    anchorOffsetDaysRef,
    lastPointerZoneRef,
  };
}
