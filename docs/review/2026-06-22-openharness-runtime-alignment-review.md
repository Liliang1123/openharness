# OpenHarness 运行时核心优势对齐方案 Review

> 文档类型：方案 Review  
> 日志及版本：2026-06-22 v1.0，基于 `docs/design/2026-06-18-openharness-runtime-alignment-plan.md` 评审生成

## 结论

需修改：方案方向正确，尤其是“稳定 System Prompt、冻结 Tools Schema、以元工具承载 Skill/Subagent、主上下文只保留摘要”的缓存友好方向值得保留；但当前方案把若干 provider 约束、缓存计费模型、安全边界与压缩协议描述成“100% 兼容 / 90%+ 命中 / 完美规避”，证据不足，且存在消息角色协议、商业加密 Skill 粉碎、自进化写回、后台压缩并发、MCP 动态发现可见性等阻塞级风险。建议先降级为分阶段 OpenSpec proposal，并用 provider matrix 与 replay benchmark 作为验收门禁。

## Review 范围

- 设计方案：`docs/design/2026-06-18-openharness-runtime-alignment-plan.md`
- 用户提供任务包摘要中的模块 A/B/C/D 与 4 个重点 Review 维度
- 项目规则：`AGENTS.md`、`openspec/AGENTS.md`
- OpenSpec 状态检查：`openspec list` 显示无 active changes；`openspec list --specs` 显示已有 `agent-runtime`、`cache-hints`、`context-builder`、`context-compression`、`mcp-tools`、`tool-protocol`、`provider-adapter` 等相关 spec

## 主要发现

### P0：Strict Alternating Roles 不能声明 100% 兼容

- 方案将 `invoke_skill` 的 `tool_result` 返回后，再追加 synthetic `assistant` + synthetic `user` 双消息，能绕开“tool call 必须有 tool result”的基本约束，但不等价于所有 provider 的 strict alternating roles 100% 兼容。
- 风险点：
  - 多数 Chat API 对 `assistant` 消息来源有隐含语义：assistant 消息通常表示模型已生成内容。运行时伪造 assistant 消息可能被 provider、审计日志、重放系统或安全策略视为模型历史，造成责任归属与 replay 不一致。
  - Anthropic/Bedrock/OpenRouter 对 tool use / tool result 的 block 结构、role 顺序、空 content、并行 tool call 合并方式并不完全一致。仅靠“assistant/user 成对追加”无法覆盖“最后一条必须为 user”“tool_result 必须直接跟随 tool_use”“assistant 中不能混入系统伪指令”等适配差异。
  - 若一轮中同时出现多个 `invoke_skill`、普通工具、失败工具调用、审批挂起或用户中断，`flushPendingInjections()` 的插入点可能破坏 tool result adjacency。
  - “Skill loaded 后请继续执行”依赖模型下一轮遵循伪系统指令，若模型把它当普通对话或与用户原始意图冲突，存在行为漂移。

建议：

- 将延迟注入抽象为 provider adapter 层能力，定义 `supportsSyntheticAssistantInjection`、`requiresLastUserMessage`、`requiresToolResultAdjacency` 等能力位。
- 默认优先使用 `user` role 的 system-tagged instruction envelope，而不是伪造 assistant；只有经过 provider replay 验证后再启用 assistant/user 双消息。
- 增加测试矩阵：single tool、parallel tools、multiple skills、tool failure、HITL pending、stream abort、manual user interrupt、Bedrock Claude、Anthropic direct、OpenRouter。

### P0：加密 Skill 与“物理粉碎”安全表述不成立

- `/tmp` 下零字节覆盖再 `unlink` 不能保证 SSD、APFS、copy-on-write、journal、swap、backup、crash dump、EDR 扫描缓存中的数据不可恢复。
- PBKDF2 解密、运行时脚本落盘、模型可编辑脚本、自进化写回共同引入供应链与越权风险，不能只靠“粉碎”描述为商业安全闭环。

建议：

- 明确安全目标从“彻底擦除物理痕迹”改为“降低普通文件系统残留风险”。
- 优先使用内存执行、临时目录权限隔离、no-log 策略、最小权限子进程、内容哈希签名、许可校验与审计事件。
- 商业加密 Skill、自进化写回、脚本可编辑必须经过 Java Gateway policy 与 HITL/签名验证。

### P0：自进化 Skill 自动写回存在供应链与稳定性风险

- “任务结束阶段异步调用 LLM 生成优化版 `SKILL.md`，递增版本号回写并 reload”会让模型生成内容直接修改可执行/可指令化资产。
- 该机制可能固化 prompt injection、把一次性错误场景写成长期规则、破坏缓存稳定、污染跨用户 Skill、绕过 review。

建议：

- 自进化默认只生成 proposal/patch，不自动生效。
- 引入 owner scope：session-local、user-local、workspace-local、global 四级隔离。
- 需要签名、diff 审查、回滚、版本锁定、灰度启用、失败率与收益统计后才能 reload。

### P1：Rolling Double Buffer 的收益需要按 provider 计费模型验证

- 双 Marker 可能提高单步回滚容错，但并非所有 provider 都允许同一请求多个 cache breakpoints，也并非都按相同方式计费 cache write/read。
- 大规模并发下，两处 cache write 的成本可能被长上下文频繁变更放大，尤其在短会话、低延迟、高 QPS 场景中可能得不偿失。

建议：

- 将双缓冲设计为策略：`off | single | double | adaptive`，默认 `adaptive`。
- 增加阈值：消息长度、历史 token 数、最近回滚率、工具失败率、会话预期长度、provider cache write 单价。
- Benchmark 输出至少分解：cache write tokens、cache read tokens、cold input tokens、TTFT、回滚恢复率、p95/p99 延迟。

### P1：Tools Schema 会话锁定与 MCP 动态发现冲突需要产品语义

- 冻结 Tools Schema 有利于缓存，但会让中途启动的 MCP 服务、用户安装的新工具、权限变更、管理员禁用工具对当前会话不可见。
- 更严重的是“工具被撤销或权限降低后当前会话仍可见”的安全语义必须说明；仅靠 Java Gateway 最终拦截会造成模型反复调用已不可用工具，影响体验和成本。

建议：

- 将 Schema 锁定拆成“工具定义冻结”和“工具可用性动态门控”两层。
- Schema 可冻结，但 execution availability、policy deny reason、revocation epoch 必须动态校验。
- 设计 `tool_catalog_epoch`：当发生安全撤权、工具破坏性变更或 schema breaking change 时，强制当前会话提示并刷新/重启；普通新增工具则延后到下一会话。

### P1：ITC 原地同模型热压缩协议不够稳

- 当前方案通过追加 `compressionInstruction: true` 消息让当前模型输出摘要，确实可能复用 warm prefix，但逻辑稳定性不天然优于独立压缩调用。
- 风险点：
  - 模型可能把压缩指令当普通用户任务回答，污染用户可见输出。
  - 压缩时如果还有 tool calls、HITL pending、streaming partial 或用户新输入，`history.replace()` 可能丢失因果链。
  - 摘要替换旧历史后，tool call id、审批记录、文件修改证据、安全审计链是否保留未定义。
  - `max_tokens: 1` dummy probe 可能无法可靠预热目标前缀，且可能触发无意义成本或 provider 限流。

建议：

- 压缩使用独立 internal operation state，而不是普通 ReAct 轮次；必须禁止工具调用、禁止用户可见输出、固定 JSON schema 输出、校验摘要字段。
- 压缩对象分层：可丢弃对话、保留事实、保留安全审计、保留未完成任务、保留 open tool/HITL 状态，不能一刀切替换。
- ITC 与独立轻量压缩应做 A/B：比较摘要忠实度、成本、cache hit、延迟、失败恢复率，不应预设 ITC 一定更稳定。

### P1：90%+ 命中率目标缺少可测定义

- 方案中的“90%+ Prompt Caching 命中率”未定义分母：按 token、请求、会话、provider billing field 还是内部估算。
- “现有 15 个测试套件 100% 通过”不能证明缓存命中率、长会话稳定性或 provider 兼容。

建议：

- 明确指标：`cache_read_input_tokens / total_input_tokens >= 0.90`，并按 provider 原始 usage 字段落库。
- 增加 replay benchmark 固定样本：长代码任务、多工具任务、Skill 任务、Subagent 任务、stream abort、MCP 动态变化。
- 验收应包含成本与延迟双指标，而不是只看 cache hit。

### P2：子智能体隔离方向正确，但边界需要补齐

- `NullUI` 防止输出污染、主上下文只保留 Summary 是合理方向。
- 仍需补齐：子 Agent 权限继承/降级、工作目录与文件写入隔离、token/cost attribution、取消传播、超时、审计链、子 Agent 不允许再开子 Agent 的具体失败语义。

### P2：测试计划偏单元，缺少契约与故障注入

- 当前测试文件设计覆盖基础逻辑，但不足以证明 provider 兼容、缓存经济性、安全网关一致性和并发恢复。

建议补充：

- Provider contract tests：Anthropic direct、Bedrock、OpenRouter mock/real replay。
- Fault injection：stream abort、tool result missing、parallel tool partial failure、HITL timeout、MCP restart、schema revoke、compression interrupted。
- Security tests：Skill path traversal、frontmatter injection、encrypted skill tamper、evolution patch malicious diff、subagent forbidden tool bypass。

## 对 4 个重点问题的直接回答

1. Strict Alternating Roles：不能证明 100% 兼容。双消息追加只解决部分 role alternation，但可能破坏 tool result adjacency，并引入 synthetic assistant 语义风险。需 provider adapter 能力矩阵和 replay contract tests。
2. Cache 双缓冲开销：长会话、高回滚/高工具失败场景可能划算；短会话、低延迟、高 QPS 场景未必划算。建议 adaptive 策略，不建议全局强制双 Marker。
3. Tools Schema 锁定与 MCP 动态发现：可以接受“普通新增工具下一会话可见”的 trade-off，但不能接受安全撤权延迟生效。应冻结 schema、动态执行门控，并定义强制刷新 epoch。
4. ITC 热压缩：复用 warm prefix 在成本上有吸引力，但稳定性不天然高于独立压缩。必须作为 internal compression mode 执行，禁止工具调用和用户可见输出，并用结构化摘要校验防止普通对话化。

## 最终建议

1. 拆分 OpenSpec change，不要一次性实现全部模块：
   - `add-runtime-cache-stability`：System Prompt 静止、session context、cache hints、tools schema freeze。
   - `add-skill-invocation-sandbox`：Skill loader、invoke_skill、延迟注入、权限与审计。
   - `add-subagent-dispatcher`：隔离子 Agent、费用汇总、取消与超时。
   - `add-internal-context-compression`：ITC 压缩协议、idle timer、摘要校验。
2. 将所有“100%”“完美”“彻底擦除”“90%+”改为可验证指标和适用边界。
3. 先做 provider matrix 与 replay benchmark，再决定默认启用策略。
4. 安全相关能力默认保守：自进化不自动生效、商业 Skill 不承诺物理不可恢复、工具撤权即时生效。

## 后续门禁

- 若进入实现：必须先创建并获批 OpenSpec proposal；当前方案涉及新增能力、架构边界、运行时语义、性能语义、安全策略和用户可见行为变化。
- OpenSpec proposal 需覆盖相关现有 spec：`agent-runtime`、`cache-hints`、`context-builder`、`context-compression`、`mcp-tools`、`tool-protocol`、`provider-adapter`、`long-term-memory`。
- 实施前需生成 Superpowers implementation plan，且每个里程碑设置 Step Evidence Gate。
- 合并前至少通过：现有 agent-runtime 测试、provider contract tests、replay benchmark、security/fault injection tests、OpenSpec strict validation。

