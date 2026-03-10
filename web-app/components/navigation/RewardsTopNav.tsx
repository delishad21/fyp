"use client";

import TabsNav, { type NavTab } from "./TabNav";

const tabs = [
  { label: "Score Reward Settings", href: "/rewards/score-settings", exact: true },
  { label: "Cosmetic Catalog", href: "/rewards/catalog", exact: true },
] satisfies NavTab[];

export default function RewardsTopNav() {
  return <TabsNav tabs={tabs} />;
}
