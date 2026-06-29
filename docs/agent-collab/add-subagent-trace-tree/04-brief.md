# add-subagent-trace-tree Step 04 Brief

文档类型：Implementation Brief
日志及版本：2026-06-29 v1
执行范围：Java Gateway trace ingestion preservation

## 背景

OpenSpec change `add-subagent-trace-tree` 已获审批。Step 01–03 已完成并通过 Review；当前只执行实施计划 Task 4。

## 允许修改范围

- `backend/src/test/java/org/openharness/backend/BackendApiTest.java`
- 本 Brief 与对应 Step 04 report/review 文档

不得修改 Java 生产代码，除非测试暴露真实 DTO 保真问题；不得修改 TS Runtime、Frontend、dashboard 或 OpenSpec 状态。

## 目标

- 验证 `/api/v1/trace/events` 接受 subagent trace-tree attributes。
- 验证 `TraceService` 保存的 attributes 与请求内容一致。
- 验证保存事件不包含请求认证 token。
- 不引入 Java Agent Loop、subagent 调度或 cost 重算逻辑。

## 验证

```bash
mvn test -f backend/pom.xml
git diff --check -- backend/src/test/java/org/openharness/backend/BackendApiTest.java
git diff -- backend/src/main/java/org/openharness/backend backend/src/test/java/org/openharness/backend/BackendApiTest.java
```
