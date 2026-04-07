import type { AIModel } from "../types";
import { getModelPricingRows } from "../pricing";

type AuthSettingsCardProps = {
  userServiceUrl: string;
  onUserServiceUrlChange: (value: string) => void;
  teacherIdentifier: string;
  onTeacherIdentifierChange: (value: string) => void;
  teacherPassword: string;
  onTeacherPasswordChange: (value: string) => void;
  aiServiceUrl: string;
  onAiServiceUrlChange: (value: string) => void;
  accessToken: string;
  onAccessTokenChange: (value: string) => void;
  analyticsSecret: string;
  onAnalyticsSecretChange: (value: string) => void;
  onSignInAndFetchToken: () => void;
  onLoadModels: () => void;
  isSigningIn: boolean;
  loadingModels: boolean;
  authStatus: string;
  models: AIModel[];
};

export default function AuthSettingsCard({
  userServiceUrl,
  onUserServiceUrlChange,
  teacherIdentifier,
  onTeacherIdentifierChange,
  teacherPassword,
  onTeacherPasswordChange,
  aiServiceUrl,
  onAiServiceUrlChange,
  accessToken,
  onAccessTokenChange,
  analyticsSecret,
  onAnalyticsSecretChange,
  onSignInAndFetchToken,
  onLoadModels,
  isSigningIn,
  loadingModels,
  authStatus,
  models,
}: AuthSettingsCardProps) {
  const pricingRows = getModelPricingRows();

  return (
    <section className="card no-print">
      <div className="grid-3">
        <div>
          <label>User Service URL</label>
          <input
            value={userServiceUrl}
            onChange={(event) => onUserServiceUrlChange(event.target.value)}
            placeholder="http://localhost:7301"
          />
        </div>
        <div>
          <label>Teacher Username / Email</label>
          <input
            value={teacherIdentifier}
            onChange={(event) => onTeacherIdentifierChange(event.target.value)}
            placeholder="delishad21"
          />
        </div>
        <div>
          <label>Teacher Password</label>
          <input
            type="password"
            value={teacherPassword}
            onChange={(event) => onTeacherPasswordChange(event.target.value)}
            placeholder="Teacher password"
          />
        </div>
        <div>
          <label>AI Service URL</label>
          <input
            value={aiServiceUrl}
            onChange={(event) => onAiServiceUrlChange(event.target.value)}
            placeholder="http://localhost:7304"
          />
        </div>
        <div>
          <label>Teacher Access Token</label>
          <input
            type="password"
            value={accessToken}
            onChange={(event) => onAccessTokenChange(event.target.value)}
            placeholder="JWT or Bearer token"
          />
        </div>
        <div>
          <label>Analytics Secret (optional)</label>
          <input
            type="password"
            value={analyticsSecret}
            onChange={(event) => onAnalyticsSecretChange(event.target.value)}
            placeholder="AI_ANALYTICS_SECRET"
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={onSignInAndFetchToken} disabled={isSigningIn}>
          {isSigningIn ? "Signing in..." : "Sign In & Fetch Token"}
        </button>
        <button onClick={onLoadModels} disabled={loadingModels || !accessToken.trim()}>
          {loadingModels ? "Loading models..." : "Load Models"}
        </button>
        {authStatus ? <span className="muted">{authStatus}</span> : null}
        <span className="muted">{models.length} model(s) available</span>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Model Pricing (USD per 1M tokens)</label>
        <table className="table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Model</th>
              <th>Input</th>
              <th>Output</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {pricingRows.map((row) => (
              <tr key={`${row.provider}:${row.model}`}>
                <td>{row.provider}</td>
                <td>{row.model}</td>
                <td>${row.inputUsdPer1M.toFixed(2)}</td>
                <td>${row.outputUsdPer1M.toFixed(2)}</td>
                <td>
                  {row.longContextInputUsdPer1M !== undefined &&
                  row.longContextOutputUsdPer1M !== undefined
                    ? `>200k input tokens/request: in $${row.longContextInputUsdPer1M.toFixed(2)}, out $${row.longContextOutputUsdPer1M.toFixed(2)}`
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
