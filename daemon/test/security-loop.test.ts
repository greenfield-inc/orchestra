import { describe, expect, it } from "vitest";
import { runSecurityLoop, type GraphQL } from "../src/security-loop.js";

interface Call { operation: string; variables: Record<string, unknown> }

// A Linear stand-in that answers by GraphQL operation name.
function fakeLinear(answers: Record<string, unknown>): { graphql: GraphQL; calls: Call[] } {
  const calls: Call[] = [];
  const graphql = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
    const operation = /(?:query|mutation)\s+(\w+)/.exec(query)![1]!;
    calls.push({ operation, variables });
    if (!(operation in answers)) throw new Error(`unexpected ${operation}`);
    return answers[operation] as T;
  };
  return { graphql, calls };
}

const base = {
  teamKey: "ENG",
  implementerActorId: "implementer-app",
  subscriberEmails: ["a@example.com", "b@example.com"],
  template: "Opened {{date}}.\n\n## Pending\n",
  date: "2026-11-06",
};

const team = (labels: Array<{ id: string }>) => ({
  teams: { nodes: [{ id: "team-1", labels: { nodes: labels } }] },
  users: { nodes: [{ id: "user-a", email: "a@example.com" }, { id: "user-b", email: "B@example.com" }] },
});

describe("runSecurityLoop", () => {
  it("creates the day's issue with both subscribers and the label, then delegates it", async () => {
    const linear = fakeLinear({
      securityLoopOpenIssues: { issues: { nodes: [] } },
      securityLoopTeam: team([{ id: "label-1" }]),
      securityLoopIssue: { issueCreate: { success: true, issue: { id: "issue-9", identifier: "ENG-9" } } },
      securityLoopDelegate: { issueUpdate: { success: true } },
    });
    expect(await runSecurityLoop({ ...base, graphql: linear.graphql })).toEqual({ action: "created", issue: "ENG-9" });
    expect(linear.calls.map(call => call.operation)).toEqual(
      ["securityLoopOpenIssues", "securityLoopTeam", "securityLoopIssue", "securityLoopDelegate"]);
    expect(linear.calls[2]!.variables.input).toEqual({
      teamId: "team-1",
      title: "Security loop · 2026-11-06",
      description: "Opened 2026-11-06.\n\n## Pending\n",
      labelIds: ["label-1"],
      subscriberIds: ["user-a", "user-b"],
    });
    expect(linear.calls[3]!.variables).toEqual({ id: "issue-9", delegateId: "implementer-app" });
  });

  it("creates the security-loop label when the team lacks it", async () => {
    const linear = fakeLinear({
      securityLoopOpenIssues: { issues: { nodes: [] } },
      securityLoopTeam: team([]),
      securityLoopLabel: { issueLabelCreate: { success: true, issueLabel: { id: "label-new" } } },
      securityLoopIssue: { issueCreate: { success: true, issue: { id: "issue-9", identifier: "ENG-9" } } },
      securityLoopDelegate: { issueUpdate: { success: true } },
    });
    await runSecurityLoop({ ...base, graphql: linear.graphql });
    expect(linear.calls.find(call => call.operation === "securityLoopLabel")!.variables)
      .toEqual({ teamId: "team-1", name: "security-loop" });
    expect((linear.calls.find(call => call.operation === "securityLoopIssue")!.variables.input as { labelIds: string[] }).labelIds)
      .toEqual(["label-new"]);
  });

  it("refuses to create an issue when a subscriber is not a Linear user", async () => {
    const linear = fakeLinear({
      securityLoopOpenIssues: { issues: { nodes: [] } },
      securityLoopTeam: team([{ id: "label-1" }]),
    });
    await expect(runSecurityLoop({ ...base, subscriberEmails: ["a@example.com", "c@example.com"], graphql: linear.graphql }))
      .rejects.toThrow("Linear users not found: c@example.com");
    expect(linear.calls.map(call => call.operation)).not.toContain("securityLoopIssue");
  });

  it("replies in the open issue's newest implementer session thread instead of creating an issue", async () => {
    const linear = fakeLinear({
      securityLoopOpenIssues: { issues: { nodes: [
        { id: "issue-new", identifier: "ENG-8", createdAt: "2026-11-05T15:00:00Z" },
        { id: "issue-old", identifier: "ENG-7", createdAt: "2026-11-04T15:00:00Z" },
      ] } },
      securityLoopIssueSessions: { issue: { agentSessions: { nodes: [
        { id: "planner-session", createdAt: "2026-11-05T16:00:00Z", appUser: { id: "planner-app" }, comment: { id: "c-planner" } },
        { id: "first-session", createdAt: "2026-11-04T15:01:00Z", appUser: { id: "implementer-app" }, comment: { id: "c-first" } },
        { id: "second-session", createdAt: "2026-11-04T18:00:00Z", appUser: { id: "implementer-app" }, comment: { id: "c-second" } },
        { id: "dismissed", createdAt: "2026-11-04T19:00:00Z", dismissedAt: "2026-11-04T19:05:00Z",
          appUser: { id: "implementer-app" }, comment: { id: "c-dismissed" } },
      ] } } },
      securityLoopReply: { commentCreate: { success: true } },
    });
    expect(await runSecurityLoop({ ...base, graphql: linear.graphql }))
      .toEqual({ action: "replied", issue: "ENG-7", agentSessionId: "second-session" });
    expect(linear.calls[1]!.variables).toEqual({ issueId: "issue-old" });
    expect(linear.calls[2]).toMatchObject({ operation: "securityLoopReply",
      variables: { issueId: "issue-old", parentId: "c-second" } });
    expect(linear.calls[2]!.variables.body).toContain("2026-11-06");
  });

  it("fails without creating a second issue when the open issue has no implementer session", async () => {
    const linear = fakeLinear({
      securityLoopOpenIssues: { issues: { nodes: [{ id: "issue-old", identifier: "ENG-7", createdAt: "2026-11-04T15:00:00Z" }] } },
      securityLoopIssueSessions: { issue: { agentSessions: { nodes: [] } } },
    });
    await expect(runSecurityLoop({ ...base, graphql: linear.graphql })).rejects.toThrow("ENG-7 is open");
    expect(linear.calls.map(call => call.operation)).toEqual(["securityLoopOpenIssues", "securityLoopIssueSessions"]);
  });
});
