## 1. Proposal 与契约
- [x] 1.1 评审并确认 Trace Tree 字段命名、节点类型与兼容策略
- [x] 1.2 更新 shared-schema trace tests，覆盖新 attributes 约定和旧事件兼容

## 2. TS Runtime Trace Tree
- [x] 2.1 增加 trace helper，生成父/子 execution tree attributes
- [x] 2.2 在 `SubagentDispatcher` 和 `AgentExecutionRunner` 发出 subagent lifecycle、model/tool boundary、summary/terminal trace 事件
- [x] 2.3 将关键 trace 事件投递到 Java `/api/v1/trace/events`，失败只记录非阻塞错误，不影响 agent 执行
- [x] 2.4 补充 agent-runtime 单测，验证字段、父子关系、cost 与 terminal classification

## 3. Java Gateway 与 Frontend
- [x] 3.1 补充 Java trace ingestion 测试，验证 subagent tree attributes 保存且不输出敏感凭据
- [x] 3.2 Frontend Debug Panel 增加 trace tree 构建与展示，旧事件回退为平铺 JSON
- [x] 3.3 补充 frontend 渲染测试，覆盖 subagent 节点、错误节点和 fallback

## 4. 验证与收尾
- [x] 4.1 运行 `pnpm --filter @openharness/shared-schema test`
- [x] 4.2 运行 `pnpm --filter @openharness/agent-runtime test -- subagentDispatcher agentExecutionRunner`
- [x] 4.3 运行 `mvn test -f backend/pom.xml`
- [x] 4.4 运行 `pnpm --filter @openharness/frontend test`
- [x] 4.5 运行 `npx openspec validate add-subagent-trace-tree --strict --no-interactive`
- [x] 4.6 实现完成后同步 dashboard verified 状态并生成 closeout
- [x] 4.7 集成或部署确认后归档 OpenSpec，并将 dashboard 更新为 archived
