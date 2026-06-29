# add-subagent-trace-tree Step 04 执行报告

## 结论

通过。

## 修改

- `backend/src/test/java/org/openharness/backend/BackendApiTest.java`
  - 新增 subagent Trace Tree ingestion 测试。
  - 断言 HTTP 202、事件数量增加、`eventType` 与完整 attributes 保真。
  - 断言保存事件序列化结果不包含服务认证 token。
- 未修改 Java 生产代码。

## 验证

- `mvn -f backend/pom.xml -Dtest=BackendApiTest test`：13 tests passed。
- `mvn -f backend/pom.xml test`：27 tests passed。
- `git diff --check`：通过。
- backend scope diff：只有 `BackendApiTest.java` 发生变化。

## 环境记录

沙箱内运行 Maven 时，Mockito/Byte Buddy 因 JVM self-attach 被限制而导致 13 个 Spring API 测试在 setup 阶段统一报错。相同命令在沙箱外运行通过，确认不是业务或新增测试失败。

## 偏离与风险

- 相比计划示例，测试增加了存储保真和 token 不泄漏断言，以覆盖 Step 目标；未扩大生产范围。
- Mockito 动态 agent 在未来 JDK 版本会被默认禁止，当前为已有构建告警，不属于本 Step。
