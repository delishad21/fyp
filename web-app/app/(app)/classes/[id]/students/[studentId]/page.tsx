import StudentProfileHeader from "@/components/classes/student-page/StudentProfileHeader";
import StudentProfileSwitcher from "@/components/classes/student-page/StudentProfileSwitcher";
import ResetStudentPasswordButton from "@/components/classes/student-page/ResetStudentPasswordButton";
import CosmeticCatalogGallery from "@/components/game/CosmeticCatalogGallery";
import BadgeCatalogGallery from "@/components/game/BadgeCatalogGallery";
import {
  getStudentInClass,
  getStudentScheduleSummary,
} from "@/services/class/actions/get-student-actions";
import {
  getRewardsCatalogAction,
  type StudentBadgeItem,
  getStudentBadgesAction,
  getStudentInventoryAction,
  updateStudentInventoryAction,
} from "@/services/game/actions/rewards-actions";
import { Cell, RowData } from "@/services/quiz/types/quiz-table-types";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string; studentId: string }>;
}) {
  const classId = (await params).id;
  const studentId = (await params).studentId;

  // 1) Student header data (rank, streak, overall)
  const sRes = await getStudentInClass(classId, studentId);
  const student = sRes?.data;
  if (!sRes?.ok || !student) return notFound();

  // 2) Schedule-level summary + rewards inventory
  const [sumRes, catalogRes, invRes, badgeRes] = await Promise.all([
    getStudentScheduleSummary(classId, studentId),
    getRewardsCatalogAction(classId),
    getStudentInventoryAction(classId, studentId),
    getStudentBadgesAction(classId, studentId),
  ]);
  if (!sumRes.ok || !sumRes.data || !catalogRes.ok || !invRes.ok) {
    return notFound();
  }

  const pagePath = `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(
    studentId,
  )}`;
  async function toggleInventoryCosmetic(formData: FormData) {
    "use server";

    const itemId = String(formData.get("itemId") || "").trim();
    if (!itemId) return;
    const catalog = await getRewardsCatalogAction(classId);
    if (!catalog.ok) return;

    const cosmeticById = new Map(
      catalog.data.cosmetics.map((item) => [item.id, item]),
    );
    const cosmetic = cosmeticById.get(itemId);
    if (!cosmetic) return;

    const current = await getStudentInventoryAction(classId, studentId);
    if (!current.ok) return;

    const compulsorySlots = new Set([
      "avatar",
      "eyes",
      "mouth",
      "upperwear",
      "lowerwear",
    ]);

    const ownedSet = new Set(
      current.data.ownedCosmeticIds.map((id) => String(id)),
    );
    const currentlyOwned = ownedSet.has(itemId);

    if (currentlyOwned) {
      if (cosmetic.defaultOwned !== false) {
        return;
      }
      if (compulsorySlots.has(cosmetic.slot)) {
        const alternatives = current.data.ownedCosmeticIds.filter((id) => {
          if (id === itemId) return false;
          return cosmeticById.get(id)?.slot === cosmetic.slot;
        });
        if (!alternatives.length) {
          return;
        }
      }
      ownedSet.delete(itemId);
    } else {
      ownedSet.add(itemId);
    }

    const nextEquipped = {
      ...(current.data.equipped || {}),
    } as Record<string, string | null>;
    if (currentlyOwned && nextEquipped[cosmetic.slot] === itemId) {
      nextEquipped[cosmetic.slot] = null;
    }

    await updateStudentInventoryAction(classId, studentId, {
      ownedCosmeticIds: Array.from(ownedSet),
      ownedBadgeIds: current.data.ownedBadgeIds || [],
      equipped: nextEquipped,
    });

    revalidatePath(pagePath);
  }

  async function toggleStudentBadge(formData: FormData) {
    "use server";

    const badgeId = String(formData.get("badgeId") || "").trim();
    if (!badgeId) return;

    const current = await getStudentInventoryAction(classId, studentId);
    if (!current.ok) return;

    const ownedSet = new Set(
      (current.data.ownedBadgeIds || []).map((id) => String(id)),
    );
    const isOwned = ownedSet.has(badgeId);
    if (!isOwned) return;

    ownedSet.delete(badgeId);

    await updateStudentInventoryAction(classId, studentId, {
      ownedCosmeticIds: current.data.ownedCosmeticIds || [],
      ownedBadgeIds: Array.from(ownedSet),
      displayBadgeIds: (current.data.displayBadgeIds || [])
        .map((id) => String(id))
        .filter((id) => id !== badgeId),
      equipped: current.data.equipped || {},
    });

    revalidatePath(pagePath);
  }

  const badgeItemsById = new Map<string, StudentBadgeItem>();
  for (const badge of catalogRes.data.badges || []) {
    const id = String(badge.id || "").trim();
    if (!id) continue;
    badgeItemsById.set(id, {
      id,
      name: String(badge.name || id),
      description: String(badge.description || ""),
      color: String(badge.color || "#64748B"),
      imageUrl: `/api/game/classes/${encodeURIComponent(
        classId,
      )}/badges/${encodeURIComponent(id)}/image.svg?v=1`,
      engraving: null,
      kind: "static",
    });
  }
  if (badgeRes.ok) {
    for (const badge of badgeRes.data.ownedBadges || []) {
      const id = String(badge.id || "").trim();
      if (!id) continue;
      badgeItemsById.set(id, badge);
    }
  }
  const mergedBadgeItems = Array.from(badgeItemsById.values());
  const ownedBadgeIdSet = new Set(
    (badgeRes.ok ? badgeRes.data.ownedBadgeIds : []).map((id) => String(id)),
  );
  const ownedBadgeItems = mergedBadgeItems.filter((badge) =>
    ownedBadgeIdSet.has(String(badge.id || "")),
  );

  // Table columns
  const columns = [
    { header: "Quiz", width: 3, align: "left" as const },
    { header: "Subject", width: 2, align: "left" as const },
    { header: "Grade", width: 2, align: "left" as const }, // canonical grade pct if present
    { header: "Latest Attempt", width: 2, align: "left" as const },
  ];

  // Build rows from schedule summary
  const rows: RowData[] = sumRes.data.schedules.map((s) => {
    const nameCell: Cell = { variant: "normal", data: { text: s.quizName } };
    const subjCell: Cell = {
      variant: "label",
      data: {
        text: s.subject ?? "—",
        dotColor: s.subjectColorHex ?? undefined,
      },
    };

    console.log("Canonical:", s.canonical);

    const hasCanonical = !!s.canonical?.attemptId;
    const gradeCell: Cell = {
      variant: "progressbar",
      data: {
        current: hasCanonical ? s.canonical!.gradePct : 0,
        total: 100,
        ...(hasCanonical
          ? {
              absValue: Math.round(s.canonical!.score),
              absMax: Math.round(s.canonical!.maxScore),
            }
          : {}),
      },
    };

    const latestText = s.latestAt
      ? new Date(s.latestAt).toLocaleDateString(undefined, {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";
    const latestCell: Cell = { variant: "normal", data: { text: latestText } };

    return {
      id: s.scheduleId,
      cells: [nameCell, subjCell, gradeCell, latestCell],
      payload: {
        canonicalAttemptId: s.canonical?.attemptId,
        latestAttemptId: s.latestAttemptId,
        scheduleId: s.scheduleId,
      },
    };
  });

  return (
    <div className="mx-auto space-y-6 p-4">
      <StudentProfileHeader
        name={student.displayName}
        avatarUrl={student.photoUrl}
        currentStreakDays={student.stats?.streakDays ?? 0}
        overallScore={student.stats?.overallScore ?? 0}
        rank={student.rank ?? null}
        badges={Array.isArray(student.badges) ? student.badges : []}
      />

      <StudentProfileSwitcher
        classId={classId}
        studentId={studentId}
        attemptsProps={{
          columns,
          rows,
          // Paging removed: schedule-summary is already condensed (1 row per schedule)
          page: 1,
          pageCount: 1,
          total: rows.length,
          pageSize: rows.length,
        }}
        statsProps={{
          rank: student.rank ?? null,
          stats: student.stats ?? null,
        }}
        inventoryPanel={
          <div className="space-y-4">
            <CosmeticCatalogGallery
              cosmetics={catalogRes.data.cosmetics}
              ownedCosmeticIds={invRes.data.ownedCosmeticIds}
              nonRevocableOwnedIds={catalogRes.data.cosmetics
                .filter((item) => item.defaultOwned !== false)
                .map((item) => item.id)}
              toggleAction={toggleInventoryCosmetic}
              compactCards
            />
          </div>
        }
        badgesPanel={
          <div className="space-y-4">
            <BadgeCatalogGallery
              badges={ownedBadgeItems}
              ownedBadgeIds={badgeRes.ok ? badgeRes.data.ownedBadgeIds : []}
              displayedBadgeIds={
                badgeRes.ok ? badgeRes.data.displayBadgeIds : []
              }
              toggleAction={toggleStudentBadge}
              allowGrant={false}
              emptyMessage="This student has no badges."
            />
          </div>
        }
        actions={
          <ResetStudentPasswordButton classId={classId} studentId={studentId} />
        }
      />
    </div>
  );
}
