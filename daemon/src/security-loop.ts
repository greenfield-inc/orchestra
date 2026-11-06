// The daily security loop: one open Linear issue at a time, worked by the implementer app.
// Each run either replies in the open issue's agent session (the daemon resumes the same
// worktree and PR) or creates the next issue and delegates it.

export const SECURITY_LOOP_TITLE_PREFIX = "Security loop ·";
export const SECURITY_LOOP_LABEL = "security-loop";

export type GraphQL = <T>(query: string, variables: Record<string, unknown>) => Promise<T>;

export interface SecurityLoopOptions {
  graphql: GraphQL;
  teamKey: string;
  implementerActorId: string;
  subscriberEmails: string[];
  template: string;
  date: string;
}

export type SecurityLoopResult =
  | { action: "replied"; issue: string; agentSessionId: string }
  | { action: "created"; issue: string };

interface IssueNode {
  id: string;
  identifier: string;
  createdAt: string;
}

interface SessionNode {
  id: string;
  createdAt: string;
  archivedAt?: string | null;
  dismissedAt?: string | null;
  appUser?: { id: string } | null;
  comment?: { id: string } | null;
}

const openIssuesQuery = `
  query securityLoopOpenIssues($teamKey: String!, $label: String!) {
    issues(first: 10, filter: {
      team: { key: { eq: $teamKey } },
      labels: { name: { eq: $label } },
      state: { type: { nin: ["completed", "canceled"] } }
    }) { nodes { id identifier createdAt } }
  }
`;

const issueSessionsQuery = `
  query securityLoopIssueSessions($issueId: String!) {
    issue(id: $issueId) {
      agentSessions(first: 50) {
        nodes { id createdAt archivedAt dismissedAt appUser { id } comment { id } }
      }
    }
  }
`;

const teamQuery = `
  query securityLoopTeam($teamKey: String!, $label: String!, $emails: [String!]!) {
    teams(filter: { key: { eq: $teamKey } }) {
      nodes { id labels(filter: { name: { eq: $label } }) { nodes { id } } }
    }
    users(filter: { email: { in: $emails } }) { nodes { id email } }
  }
`;

const labelCreateMutation = `
  mutation securityLoopLabel($teamId: String!, $name: String!) {
    issueLabelCreate(input: { teamId: $teamId, name: $name }) { success issueLabel { id } }
  }
`;

const issueCreateMutation = `
  mutation securityLoopIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) { success issue { id identifier } }
  }
`;

// Delegation is a separate update so that Linear starts the agent session the same way
// it does when a person delegates an existing issue.
const delegateMutation = `
  mutation securityLoopDelegate($id: String!, $delegateId: String!) {
    issueUpdate(id: $id, input: { delegateId: $delegateId }) { success }
  }
`;

const replyMutation = `
  mutation securityLoopReply($issueId: String!, $parentId: String!, $body: String!) {
    commentCreate(input: { issueId: $issueId, parentId: $parentId, body: $body }) { success }
  }
`;

export function securityLoopTitle(date: string): string {
  return `${SECURITY_LOOP_TITLE_PREFIX} ${date}`;
}

export function isSecurityLoopTitle(title: string | undefined): boolean {
  return title?.startsWith(SECURITY_LOOP_TITLE_PREFIX) ?? false;
}

export function dailyReply(date: string): string {
  return `Daily run, ${date}. Follow the procedure in this issue's description: update the rolling branch from main, fix the next alerts, push to the same PR, and rewrite the Pending section.`;
}

export async function runSecurityLoop(options: SecurityLoopOptions): Promise<SecurityLoopResult> {
  const { graphql } = options;
  const open = await graphql<{ issues: { nodes: IssueNode[] } }>(openIssuesQuery,
    { teamKey: options.teamKey, label: SECURITY_LOOP_LABEL });
  const oldest = [...open.issues.nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (oldest) return reply(options, oldest);
  return create(options);
}

async function reply(options: SecurityLoopOptions, issue: IssueNode): Promise<SecurityLoopResult> {
  const data = await options.graphql<{ issue: { agentSessions: { nodes: SessionNode[] } } | null }>(
    issueSessionsQuery, { issueId: issue.id });
  const session = (data.issue?.agentSessions.nodes ?? [])
    .filter(node => node.appUser?.id === options.implementerActorId && !node.archivedAt && !node.dismissedAt && node.comment)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!session) throw new Error(`${issue.identifier} is open but has no implementer agent session to reply in`);
  await mutate(options.graphql, replyMutation,
    { issueId: issue.id, parentId: session.comment!.id, body: dailyReply(options.date) }, "commentCreate");
  return { action: "replied", issue: issue.identifier, agentSessionId: session.id };
}

async function create(options: SecurityLoopOptions): Promise<SecurityLoopResult> {
  const { graphql } = options;
  const team = await graphql<{
    teams: { nodes: Array<{ id: string; labels: { nodes: Array<{ id: string }> } }> };
    users: { nodes: Array<{ id: string; email: string }> };
  }>(teamQuery, { teamKey: options.teamKey, label: SECURITY_LOOP_LABEL, emails: options.subscriberEmails });
  const teamNode = team.teams.nodes[0];
  if (!teamNode) throw new Error(`Linear team ${options.teamKey} not found`);
  const found = new Set(team.users.nodes.map(user => user.email.toLowerCase()));
  const missing = options.subscriberEmails.filter(email => !found.has(email.toLowerCase()));
  if (missing.length > 0) throw new Error(`Linear users not found: ${missing.join(", ")}`);
  let labelId = teamNode.labels.nodes[0]?.id;
  if (!labelId) {
    const label = await graphql<{ issueLabelCreate: { success: boolean; issueLabel?: { id: string } | null } }>(
      labelCreateMutation, { teamId: teamNode.id, name: SECURITY_LOOP_LABEL });
    labelId = label.issueLabelCreate.issueLabel?.id;
    if (!label.issueLabelCreate.success || !labelId) throw new Error("issueLabelCreate failed");
  }
  const created = await graphql<{ issueCreate: { success: boolean; issue?: { id: string; identifier: string } | null } }>(
    issueCreateMutation, { input: {
      teamId: teamNode.id,
      title: securityLoopTitle(options.date),
      description: options.template.replaceAll("{{date}}", options.date),
      labelIds: [labelId],
      subscriberIds: team.users.nodes.map(user => user.id),
    } });
  const issue = created.issueCreate.issue;
  if (!created.issueCreate.success || !issue) throw new Error("issueCreate failed");
  await mutate(graphql, delegateMutation, { id: issue.id, delegateId: options.implementerActorId }, "issueUpdate");
  return { action: "created", issue: issue.identifier };
}

async function mutate(graphql: GraphQL, query: string, variables: Record<string, unknown>, field: string): Promise<void> {
  const result = await graphql<Record<string, { success: boolean }>>(query, variables);
  if (!result[field]?.success) throw new Error(`${field} failed`);
}
