import AccountSettingsForm from "@/components/auth/forms/account-settings/AccountSettingsForm";
import { getSession } from "@/services/user/session-definitions";

export default async function AccountSettingsPage() {
  const session = await getSession();
  return (
    <div className="max-w-3xl">
      <AccountSettingsForm
        userId={session.userId ?? ""}
        username={session.username ?? ""}
        name={session.name ?? ""}
        honorific={session.honorific ?? ""}
        email={session.email ?? ""}
      />
    </div>
  );
}
