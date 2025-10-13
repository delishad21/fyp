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
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-md font-semibold text-[var(--color-text-primary)]">
          Issued Credentials ({creds.length})
        </h3>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={downloadCsv}>
            Download CSV
          </Button>
          <Button variant="ghost" onClick={copyAll}>
            Copy all
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-md">
          <thead className="text-left text-[var(--color-text-secondary)]">
            <tr>
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Temporary Password</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody className="align-top">
            {creds.map((c, i) => (
              <tr
                key={`${c.userId || c.username || i}-${i}`}
                className="border-t border-[var(--color-bg4)]"
              >
                <td className="py-2 pr-4">{i + 1}</td>
                <td className="py-2 pr-4">{c.name ?? "—"}</td>
                <td className="py-2 pr-4">{c.username ?? "—"}</td>
                <td className="py-2 pr-4">{c.email ?? "—"}</td>
                <td className="py-2 pr-4 font-mono">
                  {c.temporaryPassword ?? "—"}
                </td>
                <td className="py-2 pr-0">
                  <Button variant="ghost" onClick={() => copyOne(c)}>
                    Copy
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
        Make sure to save or distribute these credentials securely. They won’t
        be shown again.
      </p>

      <div className="mt-4 flex justify-end">
        <a
          href={onDoneHref}
          className="rounded-sm bg-[var(--color-primary)] px-4 py-2 text-sm text-white"
        >
          Done
        </a>
      </div>
    </div>
  );
}
