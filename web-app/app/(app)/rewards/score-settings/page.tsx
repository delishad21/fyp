import { revalidatePath } from "next/cache";
import { getClasses } from "@/services/class/actions/class-actions";
import {
  getClassBadgeConfigAction,
  getClassScoreRewardConfigAction,
  updateClassBadgeConfigAction,
  updateScoreRewardConfigAction,
} from "@/services/game/actions/rewards-actions";
import Button from "@/components/ui/buttons/Button";
import TextInput from "@/components/ui/text-inputs/TextInput";
import Select from "@/components/ui/selectors/select/Select";

type SearchParams = {
  edit?: string;
};

function parseBool(input: FormDataEntryValue | null, fallback: boolean) {
  if (typeof input !== "string") return fallback;
  const value = input.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function parsePositiveInt(input: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export default async function RewardsScoreSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const classes = await getClasses();
  const classOptions = Array.isArray(classes)
    ? (classes as Array<{ _id?: string; name?: string }>)
        .map((cls) => ({
          id: String(cls._id || ""),
          name: String(cls.name || cls._id || "Untitled Class"),
        }))
        .filter((cls) => cls.id.length > 0)
    : [];

  const classIdSet = new Set(classOptions.map((c) => c.id));
  const qs = (await searchParams) || {};
  const editClassIdRaw = String(qs.edit || "").trim();
  const editClassId = classIdSet.has(editClassIdRaw) ? editClassIdRaw : "";

  const configRows = await Promise.all(
    classOptions.map(async (cls) => {
      const [scoreRes, badgeRes] = await Promise.all([
        getClassScoreRewardConfigAction(cls.id),
        getClassBadgeConfigAction(cls.id),
      ]);

      return {
        classId: cls.id,
        className: cls.name,
        scoreConfig: scoreRes.ok ? scoreRes.data : null,
        badgeConfig: badgeRes.ok ? badgeRes.data : null,
        scoreError: scoreRes.ok ? null : scoreRes.message,
        badgeError: badgeRes.ok ? null : badgeRes.message,
      };
    })
  );

  async function saveClassSettings(formData: FormData) {
    "use server";

    const classId = String(formData.get("classId") || "").trim();
    if (!classIdSet.has(classId)) return;

    const scoreEnabled = parseBool(formData.get("scoreEnabled"), true);
    const scoreStep = parsePositiveInt(formData.get("scoreStep"), 500);

    const weeklyTopEnabled = parseBool(formData.get("weeklyTopEnabled"), false);
    const monthlyTopEnabled = parseBool(formData.get("monthlyTopEnabled"), true);
    const overallScoreThresholdEnabled = parseBool(
      formData.get("overallScoreThresholdEnabled"),
      true
    );
    const streakThresholdEnabled = parseBool(
      formData.get("streakThresholdEnabled"),
      true
    );
    const overallScoreThresholdStep = parsePositiveInt(
      formData.get("overallScoreThresholdStep"),
      1000
    );
    const streakThresholdStep = parsePositiveInt(
      formData.get("streakThresholdStep"),
      25
    );

    await Promise.all([
      updateScoreRewardConfigAction(classId, {
        enabled: scoreEnabled,
        pointsPerReward: scoreStep,
      }),
      updateClassBadgeConfigAction(classId, {
        weeklyTopEnabled,
        monthlyTopEnabled,
        overallScoreThresholdEnabled,
        streakThresholdEnabled,
        overallScoreThresholdStep,
        streakThresholdStep,
      }),
    ]);

    revalidatePath("/rewards/score-settings");
  }

  return (
    <section className="space-y-4 rounded-md bg-[var(--color-bg2)] p-4 ring-1 ring-black/5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Class Game Settings
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Configure score reward cadence and badge rules per class.
        </p>
      </div>

      {configRows.length > 0 ? (
        <div className="overflow-x-auto rounded-md bg-[var(--color-bg3)] ring-1 ring-black/5">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="border-b border-[var(--color-bg4)] text-[var(--color-text-secondary)]">
              <tr>
                <th className="px-3 py-2 text-left">Class</th>
                <th className="px-3 py-2 text-left">Score Step</th>
                <th className="px-3 py-2 text-left">Score Enabled</th>
                <th className="px-3 py-2 text-left">Overall Badge Step</th>
                <th className="px-3 py-2 text-left">Overall Badge Enabled</th>
                <th className="px-3 py-2 text-left">Streak Badge Step</th>
                <th className="px-3 py-2 text-left">Streak Badge Enabled</th>
                <th className="px-3 py-2 text-left">Weekly Top Badge</th>
                <th className="px-3 py-2 text-left">Monthly Top Badge</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {configRows.map((row) => {
                const editing = editClassId === row.classId;
                const formId = `game-settings-${row.classId}`;
                const scoreStep = Number(row.scoreConfig?.pointsPerReward || 500);
                const scoreEnabled = row.scoreConfig?.enabled !== false;
                const badgeOverallStep = Number(
                  row.badgeConfig?.overallScoreThresholdStep || 1000
                );
                const badgeOverallEnabled =
                  row.badgeConfig?.overallScoreThresholdEnabled !== false;
                const badgeStreakStep = Number(row.badgeConfig?.streakThresholdStep || 25);
                const badgeStreakEnabled =
                  row.badgeConfig?.streakThresholdEnabled !== false;
                const weeklyEnabled = row.badgeConfig?.weeklyTopEnabled === true;
                const monthlyEnabled = row.badgeConfig?.monthlyTopEnabled !== false;

                return (
                  <tr
                    key={row.classId}
                    className="border-t border-[var(--color-bg4)] text-[var(--color-text-primary)]"
                  >
                    <td className="px-3 py-2">{row.className}</td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <TextInput
                          id={`score-step-${row.classId}`}
                          form={formId}
                          name="scoreStep"
                          type="number"
                          min={1}
                          step={1}
                          defaultValue={scoreStep}
                          className="w-32"
                          required
                        />
                      ) : row.scoreConfig ? (
                        `${row.scoreConfig.pointsPerReward}`
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <Select
                          id={`score-enabled-${row.classId}`}
                          form={formId}
                          name="scoreEnabled"
                          defaultValue={scoreEnabled ? "true" : "false"}
                          options={[
                            { label: "Enabled", value: "true" },
                            { label: "Disabled", value: "false" },
                          ]}
                          className="w-36"
                        />
                      ) : row.scoreConfig ? (
                        row.scoreConfig.enabled ? "Enabled" : "Disabled"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <TextInput
                          id={`badge-overall-step-${row.classId}`}
                          form={formId}
                          name="overallScoreThresholdStep"
                          type="number"
                          min={1}
                          step={1}
                          defaultValue={badgeOverallStep}
                          className="w-32"
                          required
                        />
                      ) : row.badgeConfig ? (
                        `${badgeOverallStep}`
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <Select
                          id={`badge-overall-enabled-${row.classId}`}
                          form={formId}
                          name="overallScoreThresholdEnabled"
                          defaultValue={badgeOverallEnabled ? "true" : "false"}
                          options={[
                            { label: "Enabled", value: "true" },
                            { label: "Disabled", value: "false" },
                          ]}
                          className="w-36"
                        />
                      ) : row.badgeConfig ? (
                        badgeOverallEnabled ? "Enabled" : "Disabled"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <TextInput
                          id={`badge-streak-step-${row.classId}`}
                          form={formId}
                          name="streakThresholdStep"
                          type="number"
                          min={1}
                          step={1}
                          defaultValue={badgeStreakStep}
                          className="w-32"
                          required
                        />
                      ) : row.badgeConfig ? (
                        `${badgeStreakStep}`
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <Select
                          id={`badge-streak-enabled-${row.classId}`}
                          form={formId}
                          name="streakThresholdEnabled"
                          defaultValue={badgeStreakEnabled ? "true" : "false"}
                          options={[
                            { label: "Enabled", value: "true" },
                            { label: "Disabled", value: "false" },
                          ]}
                          className="w-36"
                        />
                      ) : row.badgeConfig ? (
                        badgeStreakEnabled ? "Enabled" : "Disabled"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <Select
                          id={`badge-weekly-enabled-${row.classId}`}
                          form={formId}
                          name="weeklyTopEnabled"
                          defaultValue={weeklyEnabled ? "true" : "false"}
                          options={[
                            { label: "Enabled", value: "true" },
                            { label: "Disabled", value: "false" },
                          ]}
                          className="w-36"
                        />
                      ) : row.badgeConfig ? (
                        weeklyEnabled ? "Enabled" : "Disabled"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <Select
                          id={`badge-monthly-enabled-${row.classId}`}
                          form={formId}
                          name="monthlyTopEnabled"
                          defaultValue={monthlyEnabled ? "true" : "false"}
                          options={[
                            { label: "Enabled", value: "true" },
                            { label: "Disabled", value: "false" },
                          ]}
                          className="w-36"
                        />
                      ) : row.badgeConfig ? (
                        monthlyEnabled ? "Enabled" : "Disabled"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {[row.scoreError, row.badgeError].filter(Boolean).join(" | ") || "OK"}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <div className="flex flex-wrap gap-2">
                          <form id={formId} action={saveClassSettings}>
                            <input type="hidden" name="classId" value={row.classId} />
                            <Button type="submit" variant="primary">
                              Save
                            </Button>
                          </form>
                          <Button href="/rewards/score-settings" variant="ghost">
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          href={`/rewards/score-settings?edit=${encodeURIComponent(
                            row.classId
                          )}`}
                          variant="ghost"
                        >
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[var(--color-bg4)] bg-[var(--color-bg3)] p-4 text-sm text-[var(--color-text-secondary)]">
          No classes available yet.
        </div>
      )}

      <div className="space-y-2 rounded-sm border border-yellow-500/35 bg-yellow-500/10 p-3 text-xs text-yellow-200">
        <p>
          Score reward threshold changes do not backfill past item rewards. Only the next
          forward threshold is used.
        </p>
        <p>
          Badge overall/streak threshold changes trigger class-wide badge recalculation based
          on the new thresholds.
        </p>
      </div>
    </section>
  );
}
