# harden-agent-runtime-single-node-production Step 05 Attempt 02 Report

文档类型：Implementation Report
日志及版本：2026-07-10 v1（Attempt 02 修复与复跑报告）

## 结论

**BLOCKED**：formal production harness 的 reasoning extraction/PASS 条件修复已通过 TDD 与 focused tests；但真实 Provider rerun 的 reasoning row 返回 HTTP 500、无 reasoningBlocks、result=blocked，因此本 attempt 未达到 real-business PASS，不能晋升 Batch 05 或 Gate C。

本 attempt 的证据包含以下关键事实：
1. 真实 Zhipu 生产 API 在本次 rerun 中依然返回 HTTP 500，故 `openai-zhipu-reasoning` 观测到 `httpStatus=500` 且 `reasoningBlocks` 缺失，结果判定为 `blocked`，但这属于正常业务预期（不再被 evaluator 本身无 blocks 提取所阻断），且 observed 成功保留了 `requestSent=true` 与 `httpStatus=500`；
2. 整体矩阵的 final result 依然为 `blocked`，未覆盖 previous PASS / accepted rows，也未将 Gate C 标为通过。

---

## 质量控制与 fingerprint

根据 Handoff Contract 指纹验证：

| 字段 | 预期值 | 实际值 | 状态 |
|---|---|---|---|
| `schema_version` | `2` | `2` | 一致 |
| `contract_revision` | `2` | `2` | 一致 |
| `current_batch / planned_batches` | `5 / 5` | `5 / 5` | 一致 |
| `attempt` | `2` | `2` | 一致 |
| `lifecycle_state` | `ready-for-execution` | `ready-for-execution` | 一致 |

Suggested Review result 为：`BLOCKED`。Governor 已完成复核并将 canonical status 转为 blocked。

---

## TDD 与单元测试运行

我们遵循严格 of TDD 规范，在新加测试后先执行了 RED 观察，然后修补了实现代码并观察到 GREEN：

### 1. RED 阶段

新加 TDD 测试 `formalProductionHarnessPassesReasoningRowOnlyWhenBackendPreservesReasoningBlocks` 验证 Fake Backend 返回 reasoningBlocks 时行应当能够 PASS。
在未修改 evaluator 源码时，运行命令：
```bash
mvn -o -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest#formalProductionHarnessPassesReasoningRowOnlyWhenBackendPreservesReasoningBlocks test
```
**测试输出 exit code 1**，Assertion 失败原因如下：
```
org.opentest4j.AssertionFailedError:
expected: "pass"
 but was: "blocked"
	at org.openharness.backend.qualification.OpenAiFakeProviderMatrixTest.formalProductionHarnessPassesReasoningRowOnlyWhenBackendPreservesReasoningBlocks(OpenAiFakeProviderMatrixTest.java:385)
```
定性为了 RED 测试按预期失败。

### 2. GREEN 阶段

在修补 `OpenAiCompatibleFormalMatrix.java` 的 evaluator 逻辑后，重新运行同一测试命令：
**测试输出 exit code 0 (BUILD SUCCESS)**。
这验证了对 `message.reasoningBlocks` 提取和 `reasoning` row PASS 逻辑的补全工作是正确的。

---

## 修改源码 Hunk

本次工作仅修改了 Brief 允许列表（allow-list）内的两个 Java 源码文件，且只在既存的 diff 基础上追加了最小修改：

### 1. [OpenAiCompatibleFormalMatrix.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/main/java/org/openharness/backend/qualification/OpenAiCompatibleFormalMatrix.java) 的修改

```diff
@@ -400,15 +400,15 @@
         Map.of("reasoningPreserved", true));
     @SuppressWarnings("unchecked")
     Map<String, Object> observed = (Map<String, Object>) row.get("observed");
-    boolean preserved = observed != null && observed.get("reasoningBlocks") != null;
+    observed = observed != null ? new LinkedHashMap<>(observed) : new LinkedHashMap<>();
+    observed.put("requestSent", true);
+    boolean preserved = observed.get("reasoningBlocks") != null;
     if (!preserved) {
-      observed = observed != null ? new LinkedHashMap<>(observed) : new LinkedHashMap<>();
-      observed.put("requestSent", true);
       observed.put("blockedReason", "Reasoning model call completed without preserved reasoning blocks.");
-      row.put("observed", QualificationRedactor.redact(observed));
       row.put("result", "blocked");
       row.put("durationMs", durationSince(start));
     }
+    row.put("observed", QualificationRedactor.redact(observed));
     return row;
   }

@@ -554,6 +554,18 @@
           observed.put("arguments", parseToolArguments(toolCalls.get(0).path("argumentsRaw").asText("")));
         }
       }
+      JsonNode reasoningBlocks = message.path("reasoningBlocks");
+      if (reasoningBlocks.isArray() && reasoningBlocks.size() > 0) {
+        try {
+          List<Map<String, Object>> blocks = MAPPER.convertValue(
+              reasoningBlocks,
+              MAPPER.getTypeFactory().constructCollectionType(List.class, Map.class)
+          );
+          observed.put("reasoningBlocks", blocks);
+        } catch (IllegalArgumentException e) {
+          // ignore
+        }
+      }
     }

     JsonNode usageNode = json.path("usage");
@@ -590,6 +590,7 @@
       case "sync", "stream" -> status == 200 && observed.get("content") != null;
       case "usage-cost" -> status == 200 && usage != null && usage.values().stream().allMatch(value -> value.longValue() >= 0);
       case "structured-tool" -> status == 200 && ((Number) observed.getOrDefault("toolCallCount", 0)).intValue() > 0;
+      case "reasoning" -> status == 200 && observed.get("reasoningBlocks") != null;
       default -> false;
     };
     return new RowEvaluation(pass, observed, usage, cost);
```

### 2. [OpenAiFakeProviderMatrixTest.java](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/backend/src/test/java/org/openharness/backend/qualification/OpenAiFakeProviderMatrixTest.java) 的修改

```diff
@@ -332,6 +332,71 @@
   }

   @Test
+  void formalProductionHarnessPassesReasoningRowOnlyWhenBackendPreservesReasoningBlocks() throws Exception {
+    HttpServer backendServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
+    backendServer.createContext("/api/v1/model/chat", exchange -> {
+      String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
+      String response;
+      if (body.contains("req-production-reasoning")) {
+        response = modelResponse(
+            "\"message\":{\"role\":\"assistant\",\"content\":\"ok\",\"reasoningBlocks\":[{\"type\":\"text\",\"text\":\"thinking process\"}]}",
+            7, 3, 10,
+            "\"error\":null");
+      } else if (body.contains("req-production-timeout")) {
+        response = modelResponse(null, 0, 0, 0,
+            "\"error\":{\"errorClass\":\"PROVIDER_TIMEOUT\",\"errorMessage\":\"Provider timed out.\",\"retriable\":true,\"retryOwner\":\"java\",\"maxRetries\":1,\"fallbackAllowed\":true,\"httpStatus\":504,\"recoveryHint\":null}");
+      } else if (body.contains("lookup")) {
+        response = modelResponse(
+            "\"message\":{\"role\":\"assistant\",\"content\":\"\",\"toolCalls\":[{\"id\":\"call-1\",\"name\":\"lookup\",\"argumentsRaw\":\"{\\\"id\\\":1}\"}]}",
+            7, 3, 10,
+            "\"error\":null");
+      } else {
+        response = modelResponse(
+            "\"message\":{\"role\":\"assistant\",\"content\":\"ok\"}",
+            7, 3, 10,
+            "\"error\":null");
+      }
+
+      byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
+      exchange.getResponseHeaders().set("Content-Type", "application/json");
+      exchange.sendResponseHeaders(200, bytes.length);
+      exchange.getResponseBody().write(bytes);
+      exchange.close();
+    });
+    backendServer.start();
+
+    try {
+      OpenAiCompatibleFormalMatrix matrix = new OpenAiCompatibleFormalMatrix();
+      Map<String, Object> report = matrix.runProduction(new OpenAiCompatibleFormalMatrix.ProductionOptions(
+          URI.create("http://127.0.0.1:" + backendServer.getAddress().getPort()),
+          "service-token",
+          "glm-4-flash",
+          "zhipu",
+          false,
+          Map.of("providerType", "openai-compatible", "rawProvider", "zhipu"),
+          null,
+          null,
+          "glm-4.7-flash"));
+
+      Map<String, Map<String, Object>> rows = rowsById(report);
+      Map<String, Object> reasoningRow = rows.get("openai-zhipu-reasoning");
+
+      assertThat(reasoningRow).isNotNull();
+      assertThat(reasoningRow.get("result")).isEqualTo("pass");
+      Map<String, Object> observed = observed(reasoningRow);
+      assertThat(observed).containsEntry("requestSent", true);
+      assertThat(observed).containsKey("reasoningBlocks");
+
+      @SuppressWarnings("unchecked")
+      List<Map<String, Object>> blocks = (List<Map<String, Object>>) observed.get("reasoningBlocks");
+      assertThat(blocks).isNotEmpty();
+      assertThat(blocks.get(0)).containsEntry("type", "text").containsEntry("text", "thinking process");
+    } finally {
+      backendServer.stop(0);
+    }
+  }
+
+  @Test
   void throwsExceptionOnMalformedStreamJson() {
```

---

## Step Critical 运行结果

所有的关键验证命令均成功执行，退出码均为 0：

| 校验步骤/命令 | 退出码/结果 | 说明 |
|---|---|---|
| `mvn -o -f backend/pom.xml -Dtest=OpenAiFakeProviderMatrixTest,QualificationReportPromoterTest,ModelControllerTest test` | exit 0 / PASS | 18/18 测试全部通过，没有发生任何 regression |
| `pnpm --filter @openharness/shared-schema test -- schema` | exit 0 / PASS | 49/49 schema 验证测试全部通过 |
| `npx openspec validate harden-agent-runtime-single-node-production --strict --no-interactive` | exit 0 / Valid | active 规格变更验证通过 |
| `npx openspec validate defer-anthropic-from-gate-c --strict --no-interactive` | exit 0 / Valid | Anthropic 规格延期变更验证通过 |
| `git diff --check` | exit 0 / Clean | 无空格或格式问题 |

---

## 真实 Provider Rerun 证据摘要

我们使用 glm-4.7-flash 经 18084 端口后端进行了一次真实 Rerun，输出到 [rerun01 JSON](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning-rerun01.json)。

### 1. 运行命令与环境

在 18084 后端健康状况为 `UP` 且输出文件不存在的前提下，通过以下命令拉起真实 Rerun：
```bash
mvn -o -f backend/pom.xml -DskipTests -Dspring-boot.run.main-class=org.openharness.backend.qualification.OpenAiCompatibleFormalMatrix -Dspring-boot.run.arguments="--track=production --backend-url=http://127.0.0.1:18084 --provider-name=zhipu --model=glm-4.7-flash --reasoning-model=glm-4.7-flash --output=/Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning-rerun01.json" org.springframework.boot:spring-boot-maven-plugin:3.5.9:run
```
命令最终 `BUILD SUCCESS`。

### 2. Output 证据文件特征

- 路径：[2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning-rerun01.json](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/docs/verification/agent-runtime-v1/providers/2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning-rerun01.json)
- `track`：`production`
- 行数量（Rows Count）：`9`
- 整体 `result`：`blocked`

`openai-zhipu-reasoning` 观测行细节：
- `required`：`true`
- `requestSent`：`true`
- `httpStatus`：`500`
- `reasoningBlocks`：缺失（由于 HTTP 500，接口未传回 blocks）
- `result`：`blocked`（符合 oracle 约束： blocks 缺失、HTTP 非 200 时继续 `blocked`）
- `durationMs`：`117`

### 3. Secret Canary Scan

对本次生成的 `2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning-rerun01.json` 及本报告进行了 secret canary scan，结论为 **Clean**（无任何明文 Provider API 密钥泄露）。
前一轮运行的 `2026-07-10-zhipu-openai-compatible-production-formal-batch05-reasoning.json` 未发生任何写入或覆盖，保持原始哈希不变。

---

## 业务验收分层与限制

| 验收层级 | 状态 | 关键证据 | 说明 |
|---|---|---|---|
| Unit | **PASS** | TDD test & unit suites 18/18 | 覆盖 Fake reasoning 提取与结果断言 |
| Schema pipeline | **PASS** | vitest 49/49 | JSON schemas & data model 校验通过 |
| Backend API | **PASS** | actuator/health UP & requestSent=true | 真实流量顺利向后端和 Zhipu 网关递送 |
| Real business | **BLOCKED** | HTTP 500, result=blocked | 真实 Zhipu 接口在推理模式下仍返回 500；无 Mock Fallback |
| Gate C promotion | **BLOCKED** | Matrix overall result=blocked | 本 Attempt 禁止开启 Gate C 关闭或 tasks 3.1/3.2/3.5/3.6 勾选 |

根据 Brief 规定，外部 Agent 禁止对 tasks 3.1/3.2/3.5/3.6 等状态做 `[x]` 标记，目前它们在 [tasks.md](file:///Users/elvis/file/develop/opensource/openharness/.worktrees/stage0-runtime-production-closeout/openspec/changes/harden-agent-runtime-single-node-production/tasks.md) 中依然为 `[ ]` 状态，Gate C 保持关闭。

---

## 偏离与遗留风险

- **无偏离**：完全严格遵照 `05-attempt-02-brief.md` 指示，没有超出 allow-list 范围的任何文件修改或行为操作。
- **下一 Owner 建议**：`codex-brief-antigravity-review`。
