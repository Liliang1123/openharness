package org.openharness.backend.service.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.openharness.backend.model.Contracts.CodexToolResultSubmission;
import org.openharness.backend.service.provider.CodexAppServerClient.FinalTurn;
import org.openharness.backend.service.provider.CodexAppServerClient.PendingToolCall;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.Identity;
import org.openharness.backend.service.provider.CodexPendingTurnRegistry.TurnBridge;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class CodexPendingTurnConfigurationTest {
  private static final Identity ID = new Identity("tenant", "user", "request", "conversation");
  private final ApplicationContextRunner runner = new ApplicationContextRunner()
      .withUserConfiguration(CodexPendingTurnConfiguration.class);

  @Test
  void defaultsCreateOneUtcSingletonWithBoundedDurations() {
    assertConfiguration(runner, Duration.ofMinutes(65), Duration.ofMinutes(5));
  }

  @Test
  void legalOverridesAndInclusiveBoundsAreAccepted() {
    List.of(
        new Durations("PT2H", "PT10M", Duration.ofHours(2), Duration.ofMinutes(10)),
        new Durations("PT1S", "PT1S", Duration.ofSeconds(1), Duration.ofSeconds(1)),
        new Durations("PT24H", "PT1H", Duration.ofHours(24), Duration.ofHours(1)))
        .forEach(values -> assertConfiguration(
            runner.withPropertyValues(
                "openharness.codex.pending-turn.ttl=" + values.ttlRaw(),
                "openharness.codex.pending-turn.retention=" + values.retentionRaw()),
            values.ttl(), values.retention()));
  }

  @Test
  void invalidOrOutOfRangeConfigurationFailsClosedWithoutRawValue() {
    List.of(
        "openharness.codex.pending-turn.ttl=CONFIG-CANARY",
        "openharness.codex.pending-turn.ttl=PT0S",
        "openharness.codex.pending-turn.ttl=-PT1S",
        "openharness.codex.pending-turn.ttl=PT0.5S",
        "openharness.codex.pending-turn.ttl=PT24H0.001S",
        "openharness.codex.pending-turn.retention=CONFIG-CANARY",
        "openharness.codex.pending-turn.retention=PT0S",
        "openharness.codex.pending-turn.retention=-PT1S",
        "openharness.codex.pending-turn.retention=PT0.5S",
        "openharness.codex.pending-turn.retention=PT1H0.001S")
        .forEach(property -> runner.withPropertyValues(property).run(context -> {
          assertThat(context).hasFailed();
          assertThat(context.getStartupFailure()).hasMessageNotContaining("CONFIG-CANARY");
        }));
  }

  private static void assertConfiguration(
      ApplicationContextRunner configured,
      Duration expectedTtl,
      Duration expectedRetention) {
    configured.run(context -> {
      assertThat(context).hasNotFailed();
      assertThat(context.getBeansOfType(CodexPendingTurnRegistry.class)).hasSize(1);
      CodexPendingTurnRegistry registry = context.getBean(CodexPendingTurnRegistry.class);
      assertThat(context.getBean(CodexPendingTurnRegistry.class)).isSameAs(registry);
      Clock clock = context.getBean("codexPendingTurnClock", Clock.class);
      assertThat(clock.getZone()).isEqualTo(ZoneOffset.UTC);
      assertThat(context.getBean("codexPendingTurnClock", Clock.class)).isSameAs(clock);

      Instant beforeRegister = clock.instant();
      String bridge = registry.register(ID,
          new PendingToolCall(1, "thread", "turn", "call", "echo", "{}"),
          finalBridge()).bridgeId();
      Instant expiry = registry.inspect(bridge).orElseThrow().expiresAt();
      Instant afterRegister = clock.instant();
      assertThat(expiry).isBetween(
          beforeRegister.plus(expectedTtl).minusMillis(1),
          afterRegister.plus(expectedTtl).plusMillis(1));

      Instant beforeComplete = clock.instant();
      registry.complete(ID, bridge, new CodexToolResultSubmission(
          "request", "conversation", "thread", "turn", "call", "key", "ok", "safe"));
      Instant retainedUntil = registry.inspect(bridge).orElseThrow().retainedUntil();
      Instant afterComplete = clock.instant();
      assertThat(retainedUntil).isBetween(
          beforeComplete.plus(expectedRetention),
          afterComplete.plus(expectedRetention).plusMillis(1));
    });
  }

  private static TurnBridge finalBridge() {
    return new TurnBridge() {
      public CodexAppServerClient.TurnResult complete(String status, String content) {
        return new FinalTurn(
            "thread", "turn", "safe", "", new CodexAppServerClient.TokenUsage(0, 0, 0));
      }
      public CodexAppServerClient.TurnResult terminate(String status) {
        return new CodexAppServerClient.ErrorTurn("BRIDGE_TERMINATED", "terminated");
      }
    };
  }

  private record Durations(
      String ttlRaw,
      String retentionRaw,
      Duration ttl,
      Duration retention) {}
}
