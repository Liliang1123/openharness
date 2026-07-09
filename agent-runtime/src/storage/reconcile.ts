import { RuntimeLifecycleCommands } from "./lifecycleCommands";
import type { RuntimeDatabase } from "./runtimeStorage";
import type { SqliteRuntimeRepositories } from "./sqliteRuntimeRepositories";

export interface ReconcileRuntimeStartupResult {
  interruptedExecutions: number;
  invalidatedApprovals: number;
}

export function reconcileRuntimeStartup(
  database: RuntimeDatabase,
  repositories: SqliteRuntimeRepositories
): ReconcileRuntimeStartupResult {
  const lifecycle = new RuntimeLifecycleCommands(database, repositories);
  const nonTerminal = database.transaction((tx) => repositories.execution.listNonTerminal(tx));
  let interruptedExecutions = 0;
  let invalidatedApprovals = 0;

  for (const execution of nonTerminal) {
    invalidatedApprovals += database.transaction((tx) =>
      repositories.approval.listPending(tx, execution.tenantId, execution.userId, execution.conversationId).length
    );
    lifecycle.interruptExecution({
      tenantId: execution.tenantId,
      userId: execution.userId,
      conversationId: execution.conversationId,
      executionId: execution.executionId,
      traceId: "startup-reconciliation",
      requestId: "startup-reconciliation",
      errorMessage: "Execution interrupted by runtime restart"
    });
    interruptedExecutions += 1;
  }

  return { interruptedExecutions, invalidatedApprovals };
}
