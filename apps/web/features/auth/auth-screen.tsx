"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { loginAction, registerAction } from "@/features/auth/actions";
import { useLanguage, type LanguageCode } from "@/features/i18n/language-provider";
import type { WorkspaceRole } from "@agent-space/db";
import { translateAuthError } from "./auth-error-messages";

type AuthMode = "login" | "register";
type TranslationFunction = (zh: string, en: string) => string;
type InvitationContext = {
  token: string;
  workspaceName: string;
  email: string;
  role: WorkspaceRole;
};

interface AuthStoryCard {
  eyebrow: string;
  title: string;
  body: string;
}

interface AuthStoryMetric {
  label: string;
  value: string;
}

interface AuthStoryDetail {
  label: string;
  value: string;
}

interface LandingShowcase {
  eyebrow: string;
  title: string;
  body: string;
  videoSrc: string;
  proof: string;
}

interface AuthStory {
  heroKicker: string;
  heroTitle: string;
  heroLead: string;
  signalPills: string[];
  features: AuthStoryCard[];
  metrics: AuthStoryMetric[];
  panelEyebrow: string;
  panelTitle: string;
  panelBody: ReactNode;
  modeGuide: string;
  invitationTitle?: string;
  invitationBody?: string;
  invitationDetails?: AuthStoryDetail[];
  submitLabel: string;
  googleLabel: string;
}

type FeedbackState =
  | { tone: "idle" }
  | { tone: "error"; message: string };

export function AuthScreen({
  hasUsers,
  googleStartUrl: externalGoogleStartUrl,
  initialError,
  initialWorkspaceJoinCode,
  invitation,
}: {
  hasUsers: boolean;
  googleStartUrl?: string;
  feishuStartUrl?: string;
  initialError?: string;
  initialWorkspaceJoinCode?: string;
  invitation?: InvitationContext;
}) {
  const { language, setLanguage, tx } = useLanguage();
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(hasUsers ? "login" : "register");
  const [feedback, setFeedback] = useState<FeedbackState>(
    initialError
      ? { tone: "error", message: translateAuthError(initialError, tx) }
      : { tone: "idle" },
  );
  const [workspaceJoinCode, setWorkspaceJoinCode] = useState(initialWorkspaceJoinCode ?? "");
  const [heroShowcaseIndex, setHeroShowcaseIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const story = buildAuthStory({ mode, invitation, tx, language });
  const landingShowcases = buildLandingShowcases(tx);
  const heroShowcase = landingShowcases[heroShowcaseIndex] ?? landingShowcases[0];
  const googleStartUrlBase = externalGoogleStartUrl ?? (invitation
    ? `/api/auth/google/start?invitationToken=${encodeURIComponent(invitation.token)}`
    : "/api/auth/google/start");
  const googleStartUrl = buildGoogleStartUrlWithJoinCode(googleStartUrlBase, invitation ? undefined : workspaceJoinCode);
  const feishuStartUrlBase = (invitation
    ? `/api/auth/feishu/start?invitationToken=${encodeURIComponent(invitation.token)}`
    : "/api/auth/feishu/start");
  const feishuStartUrl = buildGoogleStartUrlWithJoinCode(feishuStartUrlBase, invitation ? undefined : workspaceJoinCode);
  const showFeishuButton = Boolean(feishuStartUrl);

  function handleSubmit(formData: FormData): void {
    setFeedback({ tone: "idle" });

    startTransition(async () => {
      try {
        const result = mode === "register"
          ? await registerAction(formData)
          : await loginAction(formData);

        if (!result.ok) {
          setFeedback({ tone: "error", message: translateAuthError(result.error, tx) });
          return;
        }

        router.push(result.redirectPath ?? "/");
        router.refresh();
      } catch (error) {
        const message = error instanceof Error
          ? translateAuthError(error.message, tx)
          : tx("请求失败，请稍后重试。", "Request failed. Please try again.");
        setFeedback({ tone: "error", message });
      }
    });
  }

  function showPreviousShowcase(): void {
    setHeroShowcaseIndex((current) => (current - 1 + landingShowcases.length) % landingShowcases.length);
  }

  function showNextShowcase(): void {
    setHeroShowcaseIndex((current) => (current + 1) % landingShowcases.length);
  }

  return (
    <main className="auth-shell auth-shell--entry">
      <header className="auth-topbar">
        <div className="auth-brand" aria-label="AgentSpace">
          <span className="auth-brand__mark">A</span>
          <span>AgentSpace</span>
        </div>
        <div className="auth-topbar__actions">
          <a className="auth-topbar__link" href="#auth-product">
            {invitation ? tx("接受邀请", "Accept invite") : tx("进入产品", "Enter product")}
          </a>
          <div className="auth-language-switch">
            <button
              className={`auth-language-switch__button${language === "zh" ? " auth-language-switch__button--active" : ""}`}
              onClick={() => setLanguage("zh")}
              type="button"
            >
              中文
            </button>
            <button
              className={`auth-language-switch__button${language === "en" ? " auth-language-switch__button--active" : ""}`}
              onClick={() => setLanguage("en")}
              type="button"
            >
              EN
            </button>
          </div>
        </div>
      </header>

      <section className="auth-hero landing-hero" aria-labelledby="auth-hero-title">
        <div className="auth-hero__copy">
          <p className="auth-kicker">{story.heroKicker}</p>
          <h1 id="auth-hero-title">{story.heroTitle}</h1>
          <p className="auth-lead">{story.heroLead}</p>
          <div className="auth-signal-row">
            {story.signalPills.map((pill) => (
              <span className="auth-signal-pill" key={pill}>
                {pill}
              </span>
            ))}
          </div>
        </div>

        <div className="auth-hero__visual landing-hero-reel">
          <div className="landing-reel__header">
            <div className="landing-reel__title">
              <span>{String(heroShowcaseIndex + 1).padStart(2, "0")} / {heroShowcase.eyebrow}</span>
              <strong>{heroShowcase.title}</strong>
            </div>
            <div className="landing-reel__controls" aria-label={tx("切换宣传点", "Switch highlight")}>
              <button
                aria-label={tx("上一个宣传点", "Previous highlight")}
                onClick={showPreviousShowcase}
                title={tx("上一个", "Previous")}
                type="button"
              >
                ‹
              </button>
              <button
                aria-label={tx("下一个宣传点", "Next highlight")}
                onClick={showNextShowcase}
                title={tx("下一个", "Next")}
                type="button"
              >
                ›
              </button>
            </div>
          </div>
          <video
            aria-label={heroShowcase.title}
            autoPlay
            className="landing-reel__video"
            key={heroShowcase.videoSrc}
            loop
            muted
            playsInline
            preload="metadata"
            src={heroShowcase.videoSrc}
          />
          <div className="landing-reel__footer">
            <p aria-live="polite">{heroShowcase.proof}</p>
            <div className="landing-reel__dots" aria-label={tx("宣传点进度", "Highlight progress")}>
              {landingShowcases.map((showcase, index) => (
                <button
                  aria-label={tx(`切换到${showcase.eyebrow}`, `Switch to ${showcase.eyebrow}`)}
                  aria-current={index === heroShowcaseIndex ? "true" : undefined}
                  className={index === heroShowcaseIndex ? "landing-reel__dot landing-reel__dot--active" : "landing-reel__dot"}
                  key={showcase.eyebrow}
                  onClick={() => setHeroShowcaseIndex(index)}
                  type="button"
                >
                  <span className="sr-only">{showcase.eyebrow}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="auth-feature-list">
          {story.features.map((feature) => (
            <article key={`${feature.eyebrow}-${feature.title}`}>
              <p className="auth-feature-list__eyebrow">{feature.eyebrow}</p>
              <strong>{feature.title}</strong>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>

      </section>

      <section className="landing-swarm" aria-labelledby="landing-swarm-title">
        <div className="landing-swarm__copy">
          <p className="auth-kicker">{tx("多人多 Agent 协作", "Multi-human, multi-agent work")}</p>
          <h2 id="landing-swarm-title">{tx("从一个 Agent，到一群 Agent。", "From one agent to a team of agents.")}</h2>
          <p>
            {tx(
              "把单个助手接入 workspace，它就不再孤立工作：可以被跨团队借用，和其他 Agent 自动对接需求，在关键节点等待人类审批，再继续把工作推向交付。",
              "Connect one assistant to the workspace and it stops working alone: it can be borrowed across teams, coordinate requests with other agents, wait for human approval at critical gates, and keep moving work toward delivery.",
            )}
            <br />
            {language === "zh" ? (
              <>把一群 agent <strong>正确地</strong>组织起来，才是真正的 agent 集群。</>
            ) : (
              <>Only when a group of agents is organized <strong>correctly</strong> does it become a real agent cluster.</>
            )}
          </p>
        </div>
        <div className="landing-swarm__rail" aria-hidden="true">
          <span>{tx("借出", "Borrow")}</span>
          <span>{tx("对接", "Coordinate")}</span>
          <span>{tx("接力", "Handoff")}</span>
          <span>{tx("审批", "Approve")}</span>
        </div>
      </section>

      <section className="landing-showcases" id="auth-showcases">
        <div className="auth-story-copy">
          <h2>{tx("调度、能力、协作、安全，构成你的 Agent 组织操作系统。", "Scheduling, capability, collaboration, and security become your operating system for agents.")}</h2>
          <p>
            {tx(
              "让最合适的 runtime 承担任务，让优秀 Agent 被整个组织复用，让复杂需求自动流转，也让访问、执行和外发始终握在人类手里。",
              "Route work to the right runtime, make great agents reusable across the organization, let complex requests move by themselves, and keep access, execution, and outbound actions under human control.",
            )}
          </p>
        </div>
        <div className="landing-showcase-grid">
          {landingShowcases.map((showcase, index) => (
            <article className="landing-showcase-card" key={showcase.title}>
              <div className="landing-showcase-card__copy">
                <span>{String(index + 1).padStart(2, "0")} / {showcase.eyebrow}</span>
                <h3>{showcase.title}</h3>
                <p>{showcase.body}</p>
                <strong>{showcase.proof}</strong>
              </div>
              <div className="landing-showcase-card__media">
                <video
                  aria-label={showcase.title}
                  autoPlay
                  controls
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  src={showcase.videoSrc}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="auth-story-section landing-operating-model">
        <div className="auth-story-copy">
          <p className="auth-kicker">{tx("运行模型", "Operating model")}</p>
          <h2>{tx("人类管方向与授权，Agent 管对接与执行。", "Humans own direction and authorization. Agents own coordination and execution.")}</h2>
          <p>
            {tx(
              "AgentSpace 把需求、运行时、审批、权限和审计放进同一个 workspace。人类不需要手工搬运上下文，只需要决定什么能做、谁能做、做到哪里。",
              "AgentSpace puts requirements, runtimes, approvals, permissions, and audit trails in one workspace. Humans do not shuttle context by hand; they decide what can run, who can run it, and how far it may go.",
            )}
          </p>
        </div>
        <div className="landing-control-board" aria-hidden="true">
          <div>
            <span>01</span>
            <strong>{tx("调度", "Scheduling")}</strong>
            <p>{tx("换 harness/runtime，不重建岗位和上下文。", "Swap harness/runtime without rebuilding identity or context.")}</p>
          </div>
          <div>
            <span>02</span>
            <strong>{tx("能力", "Capability")}</strong>
            <p>{tx("Agent、runtime、harness 成为可借用、可复用的组织能力。", "Agents, runtimes, and harnesses become borrowable, reusable organizational capability.")}</p>
          </div>
          <div>
            <span>03</span>
            <strong>{tx("协作", "Collaboration")}</strong>
            <p>{tx("真人只处理关键审批，Agent 负责需求接力。", "People handle critical approvals while agents carry the work between roles.")}</p>
          </div>
          <div>
            <span>04</span>
            <strong>{tx("安全", "Security")}</strong>
            <p>{tx("权限、凭据、文档、外发动作都进入可见控制面。", "Permissions, credentials, documents, and outbound actions enter a visible control plane.")}</p>
          </div>
        </div>
      </section>

      <section className="auth-product-entry" id="auth-product">
        <div className="auth-product-entry__copy">
          <p className="auth-kicker">{tx("进入产品", "Enter the product")}</p>
          <h2>{tx("最后，进入你的工作区。", "Finally, step into your workspace.")}</h2>
          <p>{story.panelBody}</p>
          <div className="auth-product-entry__metrics">
            {story.metrics.map((metric) => (
              <article className="auth-metric-card" key={`${metric.label}-${metric.value}`}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>
        </div>

        <section className="auth-card">
          <div className="auth-card__intro">
            <p className="auth-card__eyebrow">{story.panelEyebrow}</p>
            <h2>{story.panelTitle}</h2>
            <p>{story.modeGuide}</p>
          </div>

          {invitation ? (
            <div className="auth-invitation-banner">
              <strong>{story.invitationTitle}</strong>
              <p>{story.invitationBody}</p>
              <div className="auth-invitation-banner__grid">
                {story.invitationDetails?.map((detail) => (
                  <div className="auth-invitation-banner__item" key={`${detail.label}-${detail.value}`}>
                    <span>{detail.label}</span>
                    <strong>{detail.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="auth-tabs">
            <button
              className={`auth-tabs__item${mode === "register" ? " auth-tabs__item--active" : ""}`}
              type="button"
              onClick={() => setMode("register")}
            >
              {tx("注册", "Register")}
            </button>
            <button
              className={`auth-tabs__item${mode === "login" ? " auth-tabs__item--active" : ""}`}
              type="button"
              onClick={() => setMode("login")}
            >
              {tx("登录", "Sign In")}
            </button>
          </div>

          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit(new FormData(event.currentTarget));
            }}
          >
            {invitation ? <input name="invitationToken" type="hidden" value={invitation.token} /> : null}
            {!invitation ? (
              <label className="auth-field">
                <span>{tx("工作区邀请码（可选）", "Workspace invite code (optional)")}</span>
                <input
                  autoComplete="off"
                  inputMode="text"
                  name="workspaceJoinCode"
                  onChange={(event) => setWorkspaceJoinCode(event.target.value)}
                  placeholder={tx("例如 A7K2M9Q4", "e.g. A7K2M9Q4")}
                  type="text"
                  value={workspaceJoinCode}
                />
                <small className="auth-field__hint">
                  {tx(
                    "如果你拿到了 8 位工作区邀请码，登录或注册后会自动加入对应工作区。",
                    "If you have an 8-character workspace invite code, sign-in or registration will join that workspace automatically.",
                  )}
                </small>
              </label>
            ) : null}
            {mode === "register" ? (
              <>
                <label className="auth-field">
                  <span>{tx("你的名字", "Your name")}</span>
                  <input autoComplete="name" name="displayName" placeholder="Mina" required type="text" />
                </label>
              </>
            ) : null}

            <label className="auth-field">
              <span>{tx("邮箱", "Email")}</span>
              {invitation ? (
                <>
                  <input name="email" type="hidden" value={invitation.email} />
                  <input
                    aria-readonly="true"
                    autoComplete="email"
                    className="auth-field__locked-input"
                    defaultValue={invitation.email}
                    disabled
                    placeholder={tx("founder@example.com", "founder@example.com")}
                    type="email"
                  />
                  <small className="auth-field__hint">
                    {tx(
                      "这条邀请已锁定到受邀邮箱。如需改用其他邮箱，请让工作区管理员重新发送邀请。",
                      "This invite is locked to the invited email. If you need another email, ask a workspace admin to send a new invite.",
                    )}
                  </small>
                </>
              ) : (
                <>
                  <input
                    autoComplete="email"
                    name="email"
                    placeholder={tx("founder@example.com", "founder@example.com")}
                    required
                    type="email"
                  />
                  {mode === "register" ? (
                    <small className="auth-field__hint">
                      {tx(
                        "首次进入会创建默认工作区，之后可以继续邀请同事或 Agent。",
                        "Your first sign-in creates a default workspace, then you can invite teammates or agents.",
                      )}
                    </small>
                  ) : null}
                </>
              )}
            </label>

            <label className="auth-field">
              <span>{tx("密码", "Password")}</span>
              <input
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                name="password"
                placeholder={tx("输入密码", "Enter password")}
                required
                type="password"
              />
            </label>

            <div className="auth-actions auth-actions--stack">
              <button className="auth-button" disabled={isPending} type="submit">
                {isPending ? tx("处理中...", "Working...") : story.submitLabel}
              </button>
              <a
                aria-disabled={isPending ? "true" : undefined}
                className="workspace-ghost-button auth-google-button"
                href={googleStartUrl}
                onClick={(event) => {
                  if (isPending) {
                    event.preventDefault();
                  }
                }}
              >
                {story.googleLabel}
              </a>
              {showFeishuButton ? (
                <a
                  aria-disabled={isPending ? "true" : undefined}
                  className="workspace-ghost-button auth-feishu-button"
                  href={feishuStartUrl}
                  onClick={(event) => {
                    if (isPending) {
                      event.preventDefault();
                    }
                  }}
                >
                  {story.feishuLabel}
                </a>
              ) : null}
              {feedback.tone === "error" ? (
                <p className="auth-feedback" role="alert">
                  {feedback.message}
                </p>
              ) : null}
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}

function buildLandingShowcases(tx: TranslationFunction): LandingShowcase[] {
  return [
    {
      eyebrow: tx("调度", "Scheduling"),
      title: tx("AgentRouter 让同一个 Agent 切到最佳 runtime", "AgentRouter routes the same agent to the best runtime"),
      body: tx(
        "保持 Agent 身份、instructions 和上下文不变，只把具体工作交给最合适的 harness/runtime。",
        "Keep the agent identity, instructions, and context stable while the right harness/runtime takes the work.",
      ),
      videoSrc: "/showcase/agentrouter-showcase.mp4",
      proof: tx("Agent 保持稳定，任务自然落到最合适的运行环境。", "The agent stays stable while each task lands in the right runtime."),
    },
    {
      eyebrow: tx("能力", "Capability"),
      title: tx("数字员工展板让 Agent 成为可借用的组织能力", "The board turns agents into borrowable organizational capability"),
      body: tx(
        "团队可以看见每位 Agent 的岗位、owner、技能、知识、runtime 绑定和借用状态，把个人工具变成组织能力。",
        "Teams can see each agent's role, owner, skills, knowledge, runtime binding, and borrowing state, turning a private tool into shared capability.",
      ),
      videoSrc: "/showcase/digital-employee-showcase.mp4",
      proof: tx("优秀 Agent 从个人工具变成团队随时可用的生产力。", "Great agents become shared productivity the whole team can use."),
    },
    {
      eyebrow: tx("协作", "Collaboration"),
      title: tx("多 Agent 自动对接需求并推进交付", "Multiple agents coordinate requests and move delivery forward"),
      body: tx(
        "需求进入 workspace 后，多个 Agent 分工整理证据、检查预算、准备审批材料，并在真人批准后继续执行。",
        "Once a request enters the workspace, agents split evidence gathering, budget checks, and approval preparation, then continue after human approval.",
      ),
      videoSrc: "/showcase/multi-agent-war-room.mp4",
      proof: tx("需求不再靠人手搬运，Agent 自动接力直到关键审批点。", "Requests stop depending on manual handoffs; agents carry the work to each critical approval point."),
    },
    {
      eyebrow: tx("安全", "Security"),
      title: tx("人类掌控访问、执行、外发和授权边界", "Humans control access, execution, outbound work, and authorization boundaries"),
      body: tx(
        "技能、知识、群文件、凭据、runtime grant、Agent 借用和外发动作都可见、可审批、可撤销、可审计。",
        "Skills, knowledge, group files, credentials, runtime grants, agent borrowing, and outbound actions stay visible, approvable, revocable, and auditable.",
      ),
      videoSrc: "/showcase/permission-governance.mp4",
      proof: tx("每一次访问、执行和外发都有边界、有记录、有控制。", "Every access, execution, and outbound action has boundaries, records, and control."),
    },
  ];
}

function buildGoogleStartUrlWithJoinCode(baseUrl: string, joinCode?: string): string {
  const normalizedJoinCode = joinCode?.trim();
  if (!normalizedJoinCode) {
    return baseUrl;
  }

  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}joinCode=${encodeURIComponent(normalizedJoinCode)}`;
}

function translateInvitationRole(
  role: WorkspaceRole,
  tx: TranslationFunction,
): string {
  if (role === "owner") {
    return tx("所有者", "Owner");
  }
  if (role === "admin") {
    return tx("管理员", "Admin");
  }
  return tx("成员", "Member");
}

function buildAuthStory({
  mode,
  invitation,
  tx,
  language,
}: {
  mode: AuthMode;
  invitation?: InvitationContext;
  tx: TranslationFunction;
  language: LanguageCode;
}): AuthStory {
  const projectIntroPoints: AuthStoryMetric[] = [
    {
      label: tx("调度", "Scheduling"),
      value: tx("Agent 保持不变，runtime 按任务切换", "Keep the agent stable while runtime changes by task"),
    },
    {
      label: tx("能力", "Capability"),
      value: tx("Agent 接入组织后可被看见、借用和复用", "Agents become visible, borrowable, reusable capability"),
    },
    {
      label: tx("协作", "Collaboration"),
      value: tx("多人多 Agent 自动对接需求并推进工作", "Multi-agent teams pick up requests and move work forward"),
    },
    {
      label: tx("安全", "Security"),
      value: tx("访问、执行、外发与授权全程可审计", "Access, execution, outbound work, and authorization stay audited"),
    },
  ];
  const landingFeatureCards: AuthStoryCard[] = [
    {
      eyebrow: tx("调度", "Scheduling"),
      title: tx("AgentRouter：同一个 Agent，调用最合适 runtime", "AgentRouter: same agent, best-fit runtime"),
      body: tx(
        "同一个 Agent 可以保留岗位、记忆和上下文，通过 AgentRouter 机制选择更合适的 harness/runtime 承担不同的工作。",
        "The same agent keeps its role, memory, and context while the AgentRouter mechanism selects a better-fit harness/runtime for different work.",
      ),
    },
    {
      eyebrow: tx("能力", "Capability"),
      title: tx("数字员工展板：在组织内展示并共享 Agent", "Digital employee board: display and share agents across the organization"),
      body: tx(
        "Agent、runtime、harness、技能和知识边界都能被看见、借出、复制和审批。\n但同时所有信息仍然安全可控。",
        "Agents, runtimes, harnesses, skills, and knowledge boundaries can be seen, borrowed, copied, and approved.\nAll information still stays secure and controlled.",
      ),
    },
    {
      eyebrow: tx("协作", "Collaboration"),
      title: tx("多 Agent 协作：Agent 对接需求，人类审批关键决策", "Multi-agent collaboration: agents coordinate, humans approve"),
      body: tx(
        "真人不再手工搬运需求，多个 Agent 接力整理证据、写文档、拆任务和推进执行。",
        "People stop shuttling requirements by hand; agents gather evidence, write docs, split tasks, and move execution forward.",
      ),
    },
    {
      eyebrow: tx("安全", "Security"),
      title: tx("权限安全：每一步都可见、可控、可追踪", "Permission security: every step visible, controlled, traceable"),
      body: tx(
        "外发、访问、凭据、runtime grant 和借用请求都能被审批、记录和追踪。",
        "Outbound actions, access, credentials, runtime grants, and borrowing requests can all be approved, recorded, and traced.",
      ),
    },
  ];
  const invitationMetrics: AuthStoryMetric[] = [
    {
      label: tx("消息", "Messages"),
      value: tx("群组、频道与私聊", "Groups, channels, and DMs"),
    },
    {
      label: tx("任务", "Tasks"),
      value: tx("任务看板、审批与执行项", "Boards, approvals, and execution items"),
    },
    {
      label: tx("知识", "Knowledge"),
      value: tx("文档、技能与 Agent 上下文", "Docs, skills, and agent context"),
    },
  ];

  if (invitation) {
    const roleLabel = translateInvitationRole(invitation.role, tx);
    return {
      heroKicker: tx("工作区邀请", "Workspace invitation"),
      heroTitle: tx(
        `加入 ${invitation.workspaceName}，在同一工作台里继续消息、任务、文档与 Agent 协作。`,
        `Join ${invitation.workspaceName} and continue messages, tasks, docs, and agent work in one workspace.`,
      ),
      heroLead: tx(
        `${invitation.workspaceName} 正在用 AgentSpace 把团队消息、任务推进、知识文档和数字员工协作收在同一个 workspace。登录后你会直接进入这个共享上下文。`,
        `${invitation.workspaceName} uses AgentSpace to keep team conversations, task execution, docs, knowledge, and digital teammates in one workspace. After sign-in, you go straight into that shared context.`,
      ),
      signalPills: [
        tx(`进入 ${invitation.workspaceName}`, `Enter ${invitation.workspaceName}`),
        tx(`角色：${roleLabel}`, `Role: ${roleLabel}`),
        tx("直达共享收件箱", "Direct to shared inbox"),
        tx("继续团队协作", "Continue team execution"),
      ],
      features: [
        {
          eyebrow: tx("团队协作", "Team workflow"),
          title: tx("进入已经在运行的协作空间", "Enter a workspace already in motion"),
          body: tx(
            "你加入的不只是一个账号，而是一个已经有消息流、任务板、文档和 Agent 执行轨迹的 workspace。",
            "You are not joining an empty account. You are entering a workspace that already has conversations, tasks, docs, and agent execution history.",
          ),
        },
        {
          eyebrow: tx("身份与权限", "Access"),
          title: tx(`你会以${roleLabel}身份进入该工作区`, `Enter the workspace with ${roleLabel} access`),
          body: tx(
            "系统会按邀请里的角色把你加入工作区，确保你进入的是正确的成员上下文。",
            "We carry the invitation role forward so you enter the workspace with the right access and member context.",
          ),
        },
        {
          eyebrow: tx("登录后", "After sign-in"),
          title: tx("直接回到共享收件箱与执行面板", "Land in the shared inbox and execution views"),
          body: tx(
            "登录完成后会继续处理这条邀请，把你带回团队协作正在发生的位置。",
            "Once authentication finishes, this invitation continues and returns you to where the team is already collaborating.",
          ),
        },
      ],
      metrics: invitationMetrics,
      panelEyebrow: tx("加入团队协作", "Join the workspace"),
      panelTitle: mode === "register"
        ? tx(`创建账号后加入 ${invitation.workspaceName}`, `Create an account to join ${invitation.workspaceName}`)
        : tx(`登录后进入 ${invitation.workspaceName}`, `Sign in to join ${invitation.workspaceName}`),
      panelBody: mode === "register"
        ? tx(
            "适合首次受邀成员。创建账号后，系统会继续处理这条邀请，并把你带回对应工作区。",
            "Best for first-time invitees. After account creation, we continue this invitation and take you into the workspace.",
          )
        : tx(
            "适合已有账号的成员。使用受邀邮箱登录后，系统会继续处理这条邀请，并直接进入对应工作区。",
            "Best for members with an existing account. Sign in with the invited email and we continue this invitation into the workspace.",
          ),
      modeGuide: mode === "register"
        ? tx(
            "首次受邀成员可以直接注册；登录表单会锁定到受邀邮箱，完成后系统会自动继续加入工作区。",
            "First-time invitees can register directly. The form stays locked to the invited email, and we join the workspace right after setup.",
          )
        : tx(
            "已有账号直接登录即可；登录表单会锁定到受邀邮箱。如果这是你第一次使用，也可以切换到注册。",
            "If you already have an account, sign in directly. The form stays locked to the invited email. If this is your first time here, switch to Register.",
          ),
      invitationTitle: tx("这条邀请会把你带进真实协作流", "This invitation drops you into a live collaboration flow"),
      invitationBody: tx(
        "加入后你会看到共享消息、任务推进、文档资料与 Agent 执行上下文，而不是一个空白工作区。",
        "After joining, you will see shared conversations, task execution, docs, and agent context instead of a blank workspace.",
      ),
      invitationDetails: [
        { label: tx("工作区", "Workspace"), value: invitation.workspaceName },
        { label: tx("角色", "Role"), value: roleLabel },
        { label: tx("登录后", "After sign-in"), value: tx("直接进入共享收件箱", "Open the shared inbox directly") },
        { label: tx("受邀邮箱", "Invited email"), value: invitation.email },
      ],
      submitLabel: mode === "register"
        ? tx("创建账号并加入工作区", "Create account and join workspace")
        : tx("登录并进入工作区", "Sign in and enter workspace"),
      googleLabel: tx("使用 Google 进入工作区", "Continue with Google to join workspace"),
      feishuLabel: tx("使用飞书进入工作区", "Continue with Feishu to join workspace"),
    };
  }

  if (mode === "register") {
    return {
      heroKicker: "AgentSpace",
      heroTitle: tx(
        "AgentSpace: Where Humans Manage Agents",
        "AgentSpace: Where Humans Manage Agents",
      ),
      heroLead: tx(
        "AgentSpace 让人类能够完全掌控 Agent，让 Agent 在 workspace 里像真实员工一样协作，同时像关键系统一样受控。一键将你的 Agent 接入整个组织，让它成为可跨团队借用、自动对接需求、调用合适 runtime 完成任务的数字员工。",
        "AgentSpace gives humans full control over agents, lets agents collaborate inside the workspace like real employees, and keeps them governed like critical systems. Connect your agent to the organization in one step, turning it into a digital employee that can be borrowed across teams, pick up requests, and call the right runtime to get work done.",
      ),
      signalPills: [
        tx("调度", "Scheduling"),
        tx("能力", "Capability"),
        tx("协作", "Collaboration"),
        tx("安全", "Security"),
      ],
      features: landingFeatureCards,
      metrics: projectIntroPoints,
      panelEyebrow: tx("创建你的数字员工网络", "Create your digital workforce"),
      panelTitle: tx("注册并开始", "Register and start"),
      panelBody: tx(
        "首次进入会创建默认 workspace。之后你可以共享数字员工、配置 runtime 和 harness、审批 Agent 行为，并邀请真人同事一起协作。",
        "Your first sign-in creates a default workspace. Then you can share digital employees, configure runtimes and harnesses, approve agent actions, and invite human teammates.",
      ),
      modeGuide: tx(
        "适合第一次使用；注册完成后会先创建默认工作区，再开始配置 Agent、runtime、harness 和权限规则。",
        "Best for first-time users. Registration creates a default workspace before you configure agents, runtimes, harnesses, and permission rules.",
      ),
      submitLabel: tx("创建账号并打开工作台", "Create account and open workspace"),
      googleLabel: tx("使用 Google 创建账号", "Continue with Google to create an account"),
      feishuLabel: tx("使用飞书创建账号", "Continue with Feishu to create an account"),
    };
  }

  return {
    heroKicker: "AgentSpace",
    heroTitle: tx(
      "AgentSpace: Where Humans Manage Agents",
      "AgentSpace: Where Humans Manage Agents",
    ),
    heroLead: tx(
      "AgentSpace 让人类能够完全掌控 Agent，让 Agent 在 workspace 里像真实员工一样协作，同时像关键系统一样受控。一键将你的 Agent 接入整个组织，让它成为可跨团队借用、自动对接需求、调用合适 runtime 完成任务的数字员工。",
      "AgentSpace gives humans full control over agents, lets agents collaborate inside the workspace like real employees, and keeps them governed like critical systems. Connect your agent to the organization in one step, turning it into a digital employee that can be borrowed across teams, pick up requests, and call the right runtime to get work done.",
    ),
    signalPills: [
      tx("调度", "Scheduling"),
      tx("能力", "Capability"),
      tx("协作", "Collaboration"),
      tx("安全", "Security"),
    ],
    features: landingFeatureCards,
    metrics: projectIntroPoints,
    panelEyebrow: tx("回到你的数字员工网络", "Return to your digital workforce"),
    panelTitle: tx("登录并继续", "Sign in and continue"),
    panelBody: language === "zh" ? (
      <>立刻注册或登录，让你的工作和组织一秒迈入<strong>原生 Agent 集群时代</strong>。</>
    ) : (
      <>Register or sign in now, and move your work and organization into the <strong>native agent-cluster era</strong> in one second.</>
    ),
    modeGuide: tx(
      "适合已有账号的回访用户；登录后会回到你最近使用的 Agent 工作区和安全控制面板。",
      "Best for returning users with an existing account. Sign in to reopen your recent agent workspace and security controls.",
    ),
    submitLabel: tx("登录进入工作台", "Sign in to workspace"),
    googleLabel: tx("使用 Google 登录", "Continue with Google"),
      feishuLabel: tx("使用飞书登录", "Continue with Feishu"),
  };
}
