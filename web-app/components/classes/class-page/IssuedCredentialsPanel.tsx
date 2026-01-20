"use client";

import * as React from "react";
import Button from "@/components/ui/buttons/Button";
import { IssuedCredential } from "@/services/class/types/class-types";

type Props = {
  creds: IssuedCredential[];
  onDoneHref?: string; // default "/classes"
};

export default function IssuedCredentialsPanel({
  creds,
  onDoneHref = "/classes",
}: Props) {
  const hasCreds = Array.isArray(creds) && creds.length > 0;
  React.useEffect(() => {
    const main = document.querySelector("main");
    if (main && "scrollTo" in main) {
      (main as HTMLElement).scrollTo({ top: 0, left: 0, behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, []);

  const copyAll = async () => {
    if (!hasCreds) return;
    const lines = [
      "username, temporaryPassword",
      ...creds.map((c) => `${c.username ?? ""}, ${c.temporaryPassword ?? ""}`),
    ].join("\n");
    await navigator.clipboard.writeText(lines);
    alert("All credentials copied");
  };

  const copyOne = async (c: IssuedCredential) => {
    const text = `username: ${c.username ?? ""}\npassword: ${
      c.temporaryPassword ?? ""
    }`;
    await navigator.clipboard.writeText(text);
    alert(`Copied: ${c.username}`);
  };

  const downloadCsv = () => {
    const rows = [
      ["Name", "Username", "Email", "Temporary Password"],
      ...creds.map((c) => [
        c.name ?? "",
        c.username ?? "",
        c.email ?? "",
        c.temporaryPassword ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => JSON.stringify(String(v ?? ""))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "issued-credentials.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-md bg-[var(--color-bg2)] p-4">
      <div className="mb-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-md font-semibold text-[var(--color-text-primary)]">
              Issued Credentials ({creds.length})
            </h3>
            <span className="text-sm font-semibold text-[var(--color-error)]">
              IMPORTANT! Make sure to save or distribute these credentials
              securely. They won’t be shown again.
            </span>
          </div>
          <div className="flex items-center gap-2 self-start">
            <Button variant="ghost" onClick={downloadCsv} className="py-1.5">
              Download CSV
            </Button>
            <Button variant="ghost" onClick={copyAll} className="py-1.5">
              Copy all
            </Button>
            <Button
              href={onDoneHref}
              className="rounded-sm bg-[var(--color-primary)] px-4 py-2 text-sm text-white"
            >
              Done
            </Button>
          </div>
        </div>
        <div className="h-px w-full bg-[var(--color-bg4)]" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-md">
          <thead className="text-left text-[var(--color-text-secondary)] border-b border-[var(--color-bg4)]">
            <tr>
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Temporary Password</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody className="align-middle">
            {creds.map((c, i) => (
              <tr
                key={`${c.userId || c.username || i}-${i}`}
                className="border-b border-[var(--color-bg4)]"
              >
                <td className="py-1 pr-4">{i + 1}</td>
                <td className="py-1 pr-4">{c.name ?? "—"}</td>
                <td className="py-1 pr-4">{c.username ?? "—"}</td>
                <td className="py-1 pr-4">{c.email ?? "—"}</td>
                <td className="py-1 pr-4 font-mono">
                  {c.temporaryPassword ?? "—"}
                </td>
                <td className="py-1 pr-0">
                  <Button variant="ghost" onClick={() => copyOne(c)}>
                    Copy
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
