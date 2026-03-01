"use client";

import TabsNav, { type NavTab } from "./TabNav";

const tabs = [
  { label: "Accounts", href: "/settings/accounts", exact: true },
  { label: "Subjects & Topics", href: "/settings/subjects" },
  // future: { label: "Notifications", href: "/settings/notifications" },
] satisfies NavTab[];

export default function SettingsTopNav() {
  return <TabsNav tabs={tabs} />;
}
