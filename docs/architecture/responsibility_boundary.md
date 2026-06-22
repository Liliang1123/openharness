# OpenHarness Responsibility Boundary Contract

> 状态：v1 草稿  
> 目的：明确 Frontend、TypeScript Agent Runtime、Java Backend 的职责边界和禁止事项。  
> 原则：Agent 决定怎么完成任务；Harness 决定什么不能被绕过。

## 1. 核心分工

| Runtime | Owner | 负责 |
|---|---|---|
| Frontend | Interaction Owner | 输入、流式展示、Trace 可视化、Approval UI |
| TypeScript Agent Runtime | Agent Harness Owner | Agent loop、MessageHistory、ToolRegistry、beforeToolUse、ask_user、streaming、step trace |
| Java Spring Boot Backend | Enterprise Gateway Owner | Model Gateway、Provider Adapter、Tool Catalog、Tool Execution、ReviewPolicy、Permission、Audit、Execution Trace |

## 2. Java 不得做的事

1. 不得拥有第二套 Agent loop。
2. 不得决定是否继续调用模型。
3. 不得决定是否替换、跳过、合并 tool_call。
4. 不得修改、追加、截断 canonical `messages` 数组，provider-specific 转换除外。
5. 不得在 system prompt 前后追加字节，哪怕一个换行。
6. 不得向 history 插入 assistant continuation。
7. 不得缓存 conversation state；conversation state 唯一权威在 TS Runtime。
8. 不得对 tool result 做语义改写；输出预算、截断、sidecar 由 TS Harness 负责。
9. 不得吞掉 provider reasoning/thinking blocks；必须透传给 TS。
10. 不得把 policy deny 改写成普通工具错误；必须返回结构化 policy decision/error。
11. 不得基于 prompt 内容放松权限。

允许例外：

1. Java 可以在 provider adapter 内做 payload 格式转换。
2. Java 可以做 provider 瞬时网络/5xx 透明重试，但必须遵守 `error_taxonomy.md` 的 retry 上限和结构化错误返回。
3. Java 可以做工具执行结果的安全脱敏，但不得改变业务语义。

## 3. TS Runtime 不得做的事

1. 不得持有 provider API key。
2. 不得绕过 Java `/api/v1/tools/execute` 直接执行业务工具。
3. 不得绕过 Java `/api/v1/policies/tool-review/evaluate` 自行判断 org/agent 动态 policy。
4. 不得跳过 `X-Trace-Id`、`X-Request-Id`、`X-User-Id`、`X-Tenant-Id` 透传。
5. 不得在发给 Java model gateway 的 provider payload 中保留内部字段，如 `systemInjected/transient/compressedSummary`。
6. 不得把 policy hint 当成 law；强制审批必须走 beforeToolUse hook。
7. 不得动态删除 tool schema 来实现 forbidden tools；必须使用 hook/policy 拦截。
8. 不得在同一 conversation 中静默切换 catalogVersion。
9. 不得在不同 `conversationId` 之间共享 MessageHistory、pending approval、catalog freeze 或 step trace 状态。

## 4. Frontend 不得做的事

1. 不得直接调用 Java model/tool/policy API，必须经 TS Runtime。
2. 不得在 client 端存 provider API key。
3. 不得伪造 `X-User-Id` / `X-Tenant-Id`，这些身份应由网关或 TS session 注入。
4. 不得自行执行 tool approval 结果；只能调用 TS `ask-user reply` API。
5. 不得把前端 Trace 面板作为审计来源；审计以 Java/TS 后端事件为准。

## 5. Agent vs Harness 判据

| 问题 | 归属 |
|---|---|
| 下一步调哪个工具 | Agent |
| 工具参数怎么填 | Agent |
| 是否需要追问澄清 | Agent |
| 工具是否允许访问某租户数据 | Harness |
| 工具是否需要审批 | Harness |
| 危险工具能否执行 | Harness |
| prompt cache marker 放哪条消息 | Harness |
| tool result 是否过大需要截断 | Harness |
| 工具结果是否需要截断、sidecar 或摘要化 | Harness |

判断规则：

```text
如果失败后果是合规事故、安全事故、越权访问、不可审计 -> Harness 强制。
如果失败后果只是体验不好、措辞不好、推理路径不优 -> Agent 决策。
```

## 6. 验收要求

1. Java controller 层拒绝缺身份 headers 的敏感 API。
2. Frontend 只配置 TS Runtime URL，不配置 Java Backend URL。
3. TS beforeToolUse hook 不能被 prompt 绕过。
4. Java `/api/v1/tools/execute` 必须二次校验 permission/policy。
